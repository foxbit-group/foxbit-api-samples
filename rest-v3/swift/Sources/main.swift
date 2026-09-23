// Foxbit REST API v3 — Swift example.
//
// Flow: fetch account info, read the public order book, place a LIMIT BUY
// order far below the market, list active orders, then cancel the order.
//
// Docs: https://docs.foxbit.com.br/rest/v3/

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking // URLSession on Linux
#endif
import Crypto // HMAC-SHA256 on Linux (CryptoKit is Apple-platform only)

// Limit price as a fraction of the best bid. The API rejects prices too far
// from the market (422, code 5005); the band width is not documented.
let priceFactor = 0.5

struct ExampleError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

// RFC 3986 percent-encoding: only unreserved characters (A-Z a-z 0-9 - . _ ~)
// are kept as-is; everything else is encoded (space -> %20, never "+").
func percentEncode(_ value: String) -> String {
    let unreserved = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )
    return value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
}

// Serializes a JSON body ONCE. The returned string is what gets signed and sent,
// so the signature always matches the bytes on the wire.
func jsonBody(_ object: [String: Any]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    guard let string = String(data: data, encoding: .utf8) else {
        throw ExampleError("Could not encode JSON body")
    }
    return string
}

// Query string with RAW (decoded) values — used ONLY in the signature pre-hash.
func decodedQuery(_ params: [(String, String)]) -> String {
    params.map { "\($0.0)=\($0.1)" }.joined(separator: "&")
}

// Percent-encoded query string (RFC 3986) — used ONLY in the request URL.
// Both strings are built from the same ordered params, so they always match.
func encodedQuery(_ params: [(String, String)]) -> String {
    params.map { "\(percentEncode($0.0))=\(percentEncode($0.1))" }.joined(separator: "&")
}

// HMAC-SHA256 (hex) over: timestamp + method + path + decodedQuery + rawBody.
// Gotcha 1: the query string goes DECODED into the pre-hash, while the URL
//           carries it percent-encoded.
// Gotcha 2: rawBody must be byte-for-byte the string sent on the wire —
//           serialize the JSON once and sign that exact string.
func sign(
    secret: String,
    timestamp: String,
    method: String,
    path: String,
    decodedQuery: String,
    rawBody: String
) -> (preHash: String, signature: String) {
    let preHash = timestamp + method + path + decodedQuery + rawBody
    let key = SymmetricKey(data: Data(secret.utf8))
    let mac = HMAC<SHA256>.authenticationCode(for: Data(preHash.utf8), using: key)
    let signature = mac.map { String(format: "%02x", $0) }.joined()
    return (preHash, signature)
}

func request(
    apiKey: String,
    apiSecret: String,
    method: String,
    path: String,
    params: [(String, String)] = [],
    rawBody: String? = nil,
    authenticated: Bool = true
) async throws -> Data {
    let baseURL = "https://api.foxbit.com.br"

    print(String(repeating: "-", count: 50))
    print("\(method) \(path)")

    var urlString = baseURL + path
    let query = encodedQuery(params)
    if !query.isEmpty { urlString += "?" + query }
    guard let url = URL(string: urlString) else {
        throw ExampleError("Invalid URL: \(urlString)")
    }

    var req = URLRequest(url: url)
    req.timeoutInterval = 30
    req.httpMethod = method
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let rawBody {
        req.httpBody = Data(rawBody.utf8) // exactly the string that gets signed
    }

    if authenticated {
        let timestamp = String(Int64(Date().timeIntervalSince1970 * 1000))
        let (preHash, signature) = sign(
            secret: apiSecret,
            timestamp: timestamp,
            method: method,
            path: path,
            decodedQuery: decodedQuery(params),
            rawBody: rawBody ?? ""
        )
        print("PreHash: \(preHash)")
        req.setValue(apiKey, forHTTPHeaderField: "X-FB-ACCESS-KEY")
        req.setValue(timestamp, forHTTPHeaderField: "X-FB-ACCESS-TIMESTAMP")
        req.setValue(signature, forHTTPHeaderField: "X-FB-ACCESS-SIGNATURE")
    }

    let (data, response) = try await URLSession.shared.data(for: req)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    print("Response (\(status)): \(String(data: data, encoding: .utf8) ?? "")")
    guard (200..<300).contains(status) else {
        throw ExampleError("HTTP \(status) on \(method) \(path)")
    }
    return data
}

// Fail fast if credentials are missing. Never print them.
let env = ProcessInfo.processInfo.environment
guard let apiKey = env["FOXBIT_API_KEY"], !apiKey.isEmpty,
      let apiSecret = env["FOXBIT_API_SECRET"], !apiSecret.isEmpty else {
    FileHandle.standardError.write(
        Data("Error: FOXBIT_API_KEY and FOXBIT_API_SECRET environment variables must be set.\n".utf8)
    )
    exit(1)
}

do {
    // 1. Account info — authenticated request without params.
    _ = try await request(apiKey: apiKey, apiSecret: apiSecret, method: "GET", path: "/rest/v3/me")

    // 2. Order book — public endpoint, no authentication headers needed.
    let orderBookData = try await request(
        apiKey: apiKey,
        apiSecret: apiSecret,
        method: "GET",
        path: "/rest/v3/markets/btcbrl/orderbook",
        params: [("depth", "1")],
        authenticated: false
    )
    guard let orderBook = try JSONSerialization.jsonObject(with: orderBookData) as? [String: Any],
          let bids = orderBook["bids"] as? [[Any]],
          let bestBidString = bids.first?.first as? String,
          let bestBid = Double(bestBidString) else {
        throw ExampleError("Could not read best bid from order book response")
    }

    // 3. Price at 50% of the best bid: inside the accepted price band but far
    //    from ever executing. The API rejects absurd prices (e.g. 10.0) with
    //    422. btcbrl has price_increment 1.0, so format it as an integer.
    let price = String(Int((bestBid * priceFactor).rounded(.down)))

    // 4. Create the order. The body is serialized ONCE; the same string is
    //    signed and sent.
    let orderBody = try jsonBody([
        "market_symbol": "btcbrl",
        "side": "BUY",
        "type": "LIMIT",
        "price": price,
        "quantity": "0.0001",
    ])
    let orderData = try await request(
        apiKey: apiKey,
        apiSecret: apiSecret,
        method: "POST",
        path: "/rest/v3/orders",
        rawBody: orderBody
    )
    guard let order = try JSONSerialization.jsonObject(with: orderData) as? [String: Any],
          let orderId = order["id"] as? String else {
        throw ExampleError("Could not read order id from create-order response")
    }

    // 5. Give the matching engine a moment before listing.
    try await Task.sleep(nanoseconds: 2_000_000_000)

    // 6. List active orders — the order created above should be present.
    _ = try await request(
        apiKey: apiKey,
        apiSecret: apiSecret,
        method: "GET",
        path: "/rest/v3/orders",
        params: [("market_symbol", "btcbrl"), ("state", "ACTIVE")]
    )

    // 7. Cancel the order created in step 4.
    let cancelBody = try jsonBody(["type": "ID", "id": orderId])
    _ = try await request(
        apiKey: apiKey,
        apiSecret: apiSecret,
        method: "PUT",
        path: "/rest/v3/orders/cancel",
        rawBody: cancelBody
    )

    print(String(repeating: "-", count: 50))
    print("Done: order \(orderId) created and cancelled.")
} catch {
    FileHandle.standardError.write(Data("Error: \(error)\n".utf8))
    exit(1)
}

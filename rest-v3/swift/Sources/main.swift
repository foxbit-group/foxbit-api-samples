import Foundation
import AsyncHTTPClient
import NIOCore
import NIOFoundationCompat
import Crypto
import NIOHTTP1

let apiBaseUrl = "https://api.foxbit.com.br"

struct FoxbitOrder: Codable {
    let id: Int
}

struct APIError: Error {
    let message: String
}

func canonicalQueryString(_ params: [String: String]) -> String {
    return params
        .map { "\($0.key)=\($0.value)" }
        .sorted()
        .joined(separator: "&")
}

func sign(
    method: String,
    path: String,
    queryString: String = "",
    body: [String: Any]? = nil
) -> (signature: String, timestamp: String) {
    let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
    
    let rawBody: String = {
        guard let body = body,
              let data = try? JSONSerialization.data(withJSONObject: body),
              let s = String(data: data, encoding: .utf8)
        else { return "" }
        return s
    }()
    
    let preHash = "\(timestamp)\(method)\(path)\(queryString)\(rawBody)"
    print("PreHash:", preHash)
    
    guard let secret = ProcessInfo.processInfo.environment["FOXBIT_API_SECRET"] else {
        fatalError("FOXBIT_API_SECRET not set")
    }
    let key = SymmetricKey(data: Data(secret.utf8))
    let signature = HMAC<SHA256>
        .authenticationCode(for: Data(preHash.utf8), using: key)
        .map { String(format: "%02hhx", $0) }
        .joined()
    print("Signature:", signature)
    
    return (signature, timestamp)
}

func request(
    method: String,
    path: String,
    params: [String: String]? = nil,
    body: [String: Any]? = nil
) async throws -> Data {
    let qs = params.map(canonicalQueryString) ?? ""
    let (signature, timestamp) = sign(method: method, path: path, queryString: qs, body: body)
    
    var fullUrl = apiBaseUrl + path
    if !qs.isEmpty {
        fullUrl += "?\(qs)"
    }
    
    var req = try HTTPClient.Request(url: fullUrl, method: HTTPMethod(rawValue: method))
    req.headers.add(name: "X-FB-ACCESS-KEY", value: ProcessInfo.processInfo.environment["FOXBIT_API_KEY"] ?? "")
    req.headers.add(name: "X-FB-ACCESS-TIMESTAMP", value: timestamp)
    req.headers.add(name: "X-FB-ACCESS-SIGNATURE", value: signature)
    req.headers.add(name: "Content-Type", value: "application/json")
    
    if let body = body {
        req.body = .data(try JSONSerialization.data(withJSONObject: body))
    }
    
    let client = HTTPClient(eventLoopGroupProvider: .createNew)
    defer { try? client.syncShutdown() }
    
    let response = try await client.execute(request: req).get()
    guard let buffer = response.body else {
        throw APIError(message: "Empty response")
    }
    return Data(buffer: buffer)
}

@main
struct FoxbitExamples {
    static func main() async {
        // Get ticker
        let tickerData: Data
        do {
            tickerData = try await request(
                method: "GET",
                path: "/rest/v3/markets/btcbrl/ticker/24hr"
            )
            print("Ticker response:", String(data: tickerData, encoding: .utf8) ?? "")
        } catch {
            print("Error fetching ticker:", error)
            return
        }

        // Parse price and compute 10% below
        let buyPriceStr: String
        do {
            guard
                let json = try JSONSerialization.jsonObject(with: tickerData) as? [String: Any],
                let dataArr = json["data"] as? [[String: Any]],
                let first = dataArr.first,
                let lastTrade = first["last_trade"] as? [String: Any],
                let priceStr = lastTrade["price"] as? String,
                let price = Double(priceStr)
            else {
                print("Error parsing ticker JSON")
                return
            }
            let buyPrice = price * 0.9
            buyPriceStr = String(format: "%.8f", buyPrice)
        } catch {
            print("Error computing buy price:", error)
            return
        }

        // Get user info
        do {
            let meData = try await request(method: "GET", path: "/rest/v3/me")
            print("Me:", String(data: meData, encoding: .utf8) ?? "")
        } catch {
            print("Error fetching user info:", error)
            return
        }

        // Create new order
        let orderData: Data
        do {
            let newOrder: [String: Any] = [
                "market_symbol": "btcbrl",
                "side": "BUY",
                "type": "LIMIT",
                "price": buyPriceStr,
                "quantity": "0.0001"
            ]
            orderData = try await request(
                method: "POST",
                path: "/rest/v3/orders",
                body: newOrder
            )
            print("Order response:", String(data: orderData, encoding: .utf8) ?? "")
        } catch {
            print("Error creating order:", error)
            return
        }

        // Extract order ID
        let orderId: String
        if
            let json = try? JSONSerialization.jsonObject(with: orderData) as? [String: Any],
            let rawId = json["id"]
        {
            if let intId = rawId as? Int {
                orderId = String(intId)
            } else if let strId = rawId as? String {
                orderId = strId
            } else {
                print("Missing 'id' in order response:", String(data: orderData, encoding: .utf8) ?? "")
                return
            }
        } else {
            print("Invalid JSON in order response:", String(data: orderData, encoding: .utf8) ?? "")
            return
        }
        print("Order ID:", orderId)

        // List active orders
        do {
            let activeData = try await request(
                method: "GET",
                path: "/rest/v3/orders",
                params: ["market_symbol": "btcbrl", "state": "ACTIVE"]
            )
            print("Active orders:", String(data: activeData, encoding: .utf8) ?? "")
        } catch {
            print("Error listing active orders:", error)
            return
        }

        // Cancel order
        do {
            let cancelBody: [String: Any] = ["type": "ID", "id": orderId]
            let cancelData = try await request(
                method: "PUT",
                path: "/rest/v3/orders/cancel",
                body: cancelBody
            )
            print("Cancel response:", String(data: cancelData, encoding: .utf8) ?? "")
        } catch {
            print("Error cancelling order:", error)
            return
        }
    }
}


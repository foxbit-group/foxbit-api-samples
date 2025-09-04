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
        print("FOXBIT_API_KEY:", ProcessInfo.processInfo.environment["FOXBIT_API_KEY"] ?? "")

        // Get the user information
        do {
            let meResponse = try await request(method: "GET", path: "/rest/v3/me")
            print("Response:", String(data: meResponse, encoding: .utf8) ?? "")
        } catch {
            print("Failed to process request.")
            return
        }

        // Get current price
        let marketSymbol = "btcbrl"
        let tickerData: Data
        do {
            tickerData = try await request(
                method: "GET",
                path: "/rest/v3/markets/\(marketSymbol)/ticker/24hr"
            )
            // Print the first-level response like in TypeScript
            print("Response:", String(data: tickerData, encoding: .utf8) ?? "")
        } catch {
            print("Failed to process request.")
            return
        }

        // Request to create a new order
        let targetPrice: String
        do {
            // Parse best.bid.price (matching the TypeScript reference)
            guard
                let json = try JSONSerialization.jsonObject(with: tickerData) as? [String: Any],
                let dataArr = json["data"] as? [[String: Any]],
                let first = dataArr.first,
                let best = first["best"] as? [String: Any],
                let bid = best["bid"] as? [String: Any],
                let priceStr = bid["price"] as? String,
                let lastPrice = Double(priceStr)
            else {
                print("Failed to process request.")
                return
            }
            let target = lastPrice * 0.9 // Calculate target price: 10% below the best bid price
            targetPrice = String(format: "%.8f", target)
        } catch {
            print("Failed to process request.")
            return
        }

        let orderData: Data
        do {
            let order: [String: Any] = [
                "market_symbol": marketSymbol,
                "side": "BUY",
                "type": "LIMIT",
                "price": targetPrice,
                "quantity": "0.0001"
            ]
            let orderResponse = try await request(
                method: "POST",
                path: "/rest/v3/orders",
                body: order
            )
            orderData = orderResponse
            print("Response:", String(data: orderData, encoding: .utf8) ?? "")
        } catch {
            print("Failed to process request.")
            return
        }

        // Sleep 2 seconds (simulate await sleep(2000))
        try? await Task.sleep(nanoseconds: 2_000_000_000)

        // Get active orders
        do {
            let oneHourAgoISO = ISO8601DateFormatter().string(from: Date(timeIntervalSinceNow: -3600))
            let ordersParams: [String: String] = [
                "market_symbol": marketSymbol,
                "state": "ACTIVE",
                "start_time": oneHourAgoISO // Optional: included to test signature behavior with special chars
            ]
            let ordersResponse = try await request(
                method: "GET",
                path: "/rest/v3/orders",
                params: ordersParams
            )
            print("Response:", String(data: ordersResponse, encoding: .utf8) ?? "")
        } catch {
            print("Failed to process request.")
            return
        }

        // Request to cancel the order
        do {
            // Extract order id (supports string or int id)
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
                    print("Failed to process request.")
                    return
                }
            } else {
                print("Failed to process request.")
                return
            }

            let orderToCancel: [String: Any] = [
                "type": "ID",
                "id": orderId
            ]
            let cancelResponse = try await request(
                method: "PUT",
                path: "/rest/v3/orders/cancel",
                body: orderToCancel
            )
            print("Response:", String(data: cancelResponse, encoding: .utf8) ?? "")
        } catch {
            print("Failed to process request.")
            return
        }
    }
}

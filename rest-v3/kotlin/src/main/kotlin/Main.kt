import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse.BodyHandlers
import java.nio.charset.StandardCharsets.UTF_8
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.floor
import kotlin.system.exitProcess
import org.json.JSONObject

private const val BASE_URL = "https://api.foxbit.com.br"

private val apiKey = requireEnv("FOXBIT_API_KEY")
private val apiSecret = requireEnv("FOXBIT_API_SECRET")
private val httpClient: HttpClient = HttpClient.newHttpClient()

private fun requireEnv(name: String): String {
    val value = System.getenv(name)
    if (value.isNullOrBlank()) {
        System.err.println("Missing required environment variable: $name")
        exitProcess(1)
    }
    return value
}

/** Percent-encodes a query key/value per RFC 3986 (space = %20, never +). */
private fun percentEncode(value: String): String =
    URLEncoder.encode(value, UTF_8).replace("+", "%20")

/**
 * Returns the HMAC-SHA256 (hex) of: timestamp + method + path + decodedQuery + rawBody.
 *
 * Gotcha #1: the query string goes into the pre-hash with RAW (decoded) values,
 * even though the URL itself carries it percent-encoded.
 */
private fun sign(
    secret: String,
    timestamp: String,
    method: String,
    path: String,
    decodedQuery: String,
    rawBody: String,
): String {
    val preHash = "$timestamp$method$path$decodedQuery$rawBody"
    println("PreHash: $preHash")
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(secret.toByteArray(UTF_8), "HmacSHA256"))
    return mac.doFinal(preHash.toByteArray(UTF_8)).joinToString("") { "%02x".format(it) }
}

/**
 * Sends a request and returns the response body, aborting on any non-2xx status.
 *
 * The encoded query (sent in the URL) and the decoded query (signed) are built
 * from the same ordered parameter list, so they can never diverge.
 *
 * Gotcha #2: the body is signed exactly as the bytes sent — it is serialized to
 * a string ONCE, and that same string is both signed and transmitted.
 */
private fun request(
    method: String,
    path: String,
    params: List<Pair<String, String>> = emptyList(),
    body: JSONObject? = null,
    auth: Boolean = true,
): String {
    val decodedQuery = params.joinToString("&") { (key, value) -> "$key=$value" }
    val encodedQuery = params.joinToString("&") { (key, value) -> "${percentEncode(key)}=${percentEncode(value)}" }
    val rawBody = body?.toString() ?: "" // single serialization: signed and sent as-is

    println("-".repeat(50))
    println("$method $path")

    val url = BASE_URL + path + if (encodedQuery.isEmpty()) "" else "?$encodedQuery"
    val builder = HttpRequest.newBuilder(URI.create(url))
        .header("Content-Type", "application/json")
        .method(method, if (rawBody.isEmpty()) BodyPublishers.noBody() else BodyPublishers.ofString(rawBody))

    if (auth) {
        val timestamp = System.currentTimeMillis().toString()
        val signature = sign(apiSecret, timestamp, method, path, decodedQuery, rawBody)
        builder
            .header("X-FB-ACCESS-KEY", apiKey)
            .header("X-FB-ACCESS-TIMESTAMP", timestamp)
            .header("X-FB-ACCESS-SIGNATURE", signature)
    }

    val response = httpClient.send(builder.build(), BodyHandlers.ofString())
    println("Response (${response.statusCode()}): ${response.body()}")
    if (response.statusCode() !in 200..299) {
        System.err.println("Request failed with HTTP ${response.statusCode()}, aborting.")
        exitProcess(1)
    }
    return response.body()
}

fun main() {
    // 1. Account information (authenticated request without params).
    request("GET", "/rest/v3/me")

    // 2. Order book snapshot (public endpoint — note auth = false: no signature needed).
    val orderbook = request(
        "GET", "/rest/v3/markets/btcbrl/orderbook",
        params = listOf("depth" to "1"),
        auth = false,
    )
    val bestBid = JSONObject(orderbook).getJSONArray("bids").getJSONArray(0).getString(0)

    // 3. Bid at 50% of the best bid: inside the accepted price band (absurd values
    // like a hardcoded 10.0 are rejected with 422 "Price out of range") yet far too
    // low to ever execute. btcbrl has price_increment 1.0, so format as an integer.
    val price = floor(bestBid.toDouble() * 0.5).toLong().toString()
    println("Best bid: $bestBid -> limit order price: $price")

    // 4. Create a LIMIT BUY order. Key order in the JSON does not matter because
    // the exact serialized string is what gets signed and sent.
    val order = JSONObject()
        .put("market_symbol", "btcbrl")
        .put("side", "BUY")
        .put("type", "LIMIT")
        .put("price", price)
        .put("quantity", "0.0001")
    val created = request("POST", "/rest/v3/orders", body = order)
    val orderId = JSONObject(created).getString("id")

    // 5. Give the matching engine a moment to register the order.
    Thread.sleep(2_000)

    // 6. The new order must show up among the active ones.
    request("GET", "/rest/v3/orders", params = listOf("market_symbol" to "btcbrl", "state" to "ACTIVE"))

    // 7. Cancel the order by its id.
    request("PUT", "/rest/v3/orders/cancel", body = JSONObject().put("type", "ID").put("id", orderId))

    println("-".repeat(50))
    println("Done: order $orderId created and cancelled.")
}

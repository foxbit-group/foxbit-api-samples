import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.net.URLEncoder
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.system.exitProcess
import kotlin.time.Duration.Companion.seconds

private const val API_BASE_URL = "https://api.foxbit.com.br"
private val JSON = "application/json".toMediaType()

private val apiKey = System.getenv("FOXBIT_API_KEY") ?: ""
private val apiSecret = System.getenv("FOXBIT_API_SECRET") ?: ""

private val client = OkHttpClient()
private val mapper = jacksonObjectMapper()

fun sign(
    method: String,
    path: String,
    params: Map<String, String>? = null,
    rawBody: String = ""
): Pair<String, String> {
    val queryString = params?.entries
        ?.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, "UTF-8")}" }
        ?: ""
    val timestamp = System.currentTimeMillis().toString()
    val preHash = "$timestamp$method$path$queryString$rawBody"
    println("PreHash: $preHash")

    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(apiSecret.toByteArray(), "HmacSHA256"))
    val signature = mac.doFinal(preHash.toByteArray())
        .joinToString("") { "%02x".format(it) }
    println("Signature: $signature")
    return signature to timestamp
}

fun request(
    method: String,
    path: String,
    params: Map<String, String>? = null,
    body: String? = null
): String {
    println("--------------------------------------------------")
    println("Requesting: $method $path")

    val (signature, timestamp) = sign(method, path, params, body ?: "")
    val urlBuilder = "$API_BASE_URL$path".toHttpUrlOrNull()!!.newBuilder()
    params?.forEach { urlBuilder.addQueryParameter(it.key, it.value) }
    val url = urlBuilder.build()

    val reqBody = body?.toRequestBody(JSON)
    val request = Request.Builder()
        .url(url)
        .method(method, if (method == "GET") null else reqBody)
        .addHeader("X-FB-ACCESS-KEY", apiKey)
        .addHeader("X-FB-ACCESS-TIMESTAMP", timestamp)
        .addHeader("X-FB-ACCESS-SIGNATURE", signature)
        .addHeader("Content-Type", "application/json")
        .build()

    client.newCall(request).execute().use { resp ->
        val respBody = resp.body?.string() ?: ""
        if (!resp.isSuccessful) {
            println("HTTP Status Code: ${resp.code}, Error Response Body: $respBody")
            exitProcess(1)
        }
        return respBody
    }
}

fun createOrder(): String {
    val order = mapOf(
        "market_symbol" to "btcbrl",
        "side" to "BUY",
        "type" to "LIMIT",
        "price" to "450000.0",
        "quantity" to "0.00001"
    )
    return request(
        method = "POST",
        path = "/rest/v3/orders",
        body = mapper.writeValueAsString(order)
    )
}

fun getActiveOrders(): String =
    request(
        method = "GET",
        path = "/rest/v3/orders",
        params = mapOf("market_symbol" to "btcbrl", "state" to "ACTIVE")
    )

fun cancelOrder(orderId: String): String {
    val cancelBody = mapOf("type" to "ID", "id" to orderId)
    return request(
        method = "PUT",
        path = "/rest/v3/orders/cancel",
        body = mapper.writeValueAsString(cancelBody)
    )
}

fun main() {
    println("FOXBIT_API_KEY: $apiKey")

    val me = request("GET", "/rest/v3/me")
    println("Response: $me")

    val orderResp = createOrder()
    println("Order Response: $orderResp")

    Thread.sleep(2.seconds.inWholeMilliseconds)

    val active = getActiveOrders()
    println("Active Orders Response: $active")

    val orderId = mapper.readTree(orderResp)["id"].asText()
    val cancelResp = cancelOrder(orderId)
    println("Cancel Response: $cancelResp")
}

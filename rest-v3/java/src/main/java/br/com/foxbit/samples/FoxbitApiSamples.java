package br.com.foxbit.samples;

import org.json.JSONObject;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.SequencedMap;
import java.util.StringJoiner;

/**
 * Foxbit REST API v3 example: fetch account info, read the public order book,
 * place a limit buy order far from the market and cancel it.
 *
 * Request signing has two classic gotchas:
 *   1. The query string goes into the signature prehash DECODED (raw values),
 *      but is sent percent-encoded (RFC 3986) in the URL.
 *   2. The body is verified against the exact bytes sent on the wire:
 *      serialize the JSON once and use that same string to sign and to send.
 */
public final class FoxbitApiSamples {

    private static final String API_BASE_URL = "https://api.foxbit.com.br";
    private static final String API_KEY = System.getenv("FOXBIT_API_KEY");
    private static final String API_SECRET = System.getenv("FOXBIT_API_SECRET");

    private static final HttpClient HTTP = HttpClient.newHttpClient();

    public static void main(String[] args) {
        if (API_KEY == null || API_KEY.isBlank() || API_SECRET == null || API_SECRET.isBlank()) {
            System.err.println("Error: set the FOXBIT_API_KEY and FOXBIT_API_SECRET environment variables.");
            System.exit(1);
        }

        try {
            // Step 1: account information (authenticated request without params).
            request("GET", "/rest/v3/me", null, null, true);

            // Step 2: top of the order book (public endpoint, no authentication).
            var orderbookParams = new LinkedHashMap<String, String>();
            orderbookParams.put("depth", "1");
            String orderbook = request("GET", "/rest/v3/markets/btcbrl/orderbook", orderbookParams, null, false);
            String bestBid = new JSONObject(orderbook).getJSONArray("bids").getJSONArray(0).getString(0);

            // Step 3: price the order at 50% of the best bid. That stays inside the
            // price band accepted by the API (an absurd price such as "10.0" is
            // rejected with 422) while being far too low to ever execute. The btcbrl
            // market has price_increment 1.0, so the price is formatted as an integer.
            String price = new BigDecimal(bestBid)
                    .multiply(new BigDecimal("0.5"))
                    .setScale(0, RoundingMode.FLOOR)
                    .toPlainString();

            // Step 4: create a limit buy order. The body is serialized ONCE and the
            // resulting string is both signed and sent (gotcha 2).
            String orderBody = new JSONObject()
                    .put("market_symbol", "btcbrl")
                    .put("side", "BUY")
                    .put("type", "LIMIT")
                    .put("price", price)
                    .put("quantity", "0.0001")
                    .toString();
            String created = request("POST", "/rest/v3/orders", null, orderBody, true);
            String orderId = new JSONObject(created).getString("id");

            // Step 5: give the matching engine a moment before listing.
            Thread.sleep(2000);

            // Step 6: list active orders — the order created above shows up here.
            var orderFilters = new LinkedHashMap<String, String>();
            orderFilters.put("market_symbol", "btcbrl");
            orderFilters.put("state", "ACTIVE");
            request("GET", "/rest/v3/orders", orderFilters, null, true);

            // Step 7: cancel the order by its id.
            String cancelBody = new JSONObject()
                    .put("type", "ID")
                    .put("id", orderId)
                    .toString();
            request("PUT", "/rest/v3/orders/cancel", null, cancelBody, true);

            System.out.println("--------------------------------------------------");
            System.out.println("Done: order " + orderId + " created and cancelled.");
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            System.exit(1);
        }
    }

    /**
     * Sends a request and returns the response body on 2xx status.
     *
     * The encoded query (for the URL) and the decoded query (for the signature
     * prehash) are built from the same insertion-ordered params, and rawBody is
     * used verbatim for both signing and sending, so the signed and transmitted
     * representations can never diverge.
     */
    private static String request(String method, String path, SequencedMap<String, String> params,
                                  String rawBody, boolean authenticated)
            throws IOException, InterruptedException, GeneralSecurityException {
        QueryStrings query = buildQueryStrings(params);
        String pathWithQuery = query.encoded().isEmpty() ? path : path + "?" + query.encoded();

        System.out.println("--------------------------------------------------");
        System.out.println(method + " " + pathWithQuery);

        var builder = HttpRequest.newBuilder(URI.create(API_BASE_URL + pathWithQuery))
                .header("Content-Type", "application/json")
                .method(method, rawBody == null
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(rawBody, StandardCharsets.UTF_8));

        if (authenticated) {
            long timestamp = System.currentTimeMillis();
            Signed signed = sign(method, path, query.decoded(), rawBody == null ? "" : rawBody, timestamp);
            System.out.println("PreHash: " + signed.preHash());
            builder.header("X-FB-ACCESS-KEY", API_KEY)
                    .header("X-FB-ACCESS-TIMESTAMP", Long.toString(timestamp))
                    .header("X-FB-ACCESS-SIGNATURE", signed.signature());
        }

        HttpResponse<String> response = HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        System.out.println("Response (" + response.statusCode() + "): " + response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("HTTP " + response.statusCode() + " for " + method + " " + path);
        }
        return response.body();
    }

    /** Decoded query string (goes into the signature) and its percent-encoded form (goes into the URL). */
    private record QueryStrings(String decoded, String encoded) {}

    /** Builds both query string forms from the same insertion-ordered params. */
    private static QueryStrings buildQueryStrings(SequencedMap<String, String> params) {
        if (params == null || params.isEmpty()) {
            return new QueryStrings("", "");
        }
        var decoded = new StringJoiner("&");
        var encoded = new StringJoiner("&");
        for (var param : params.entrySet()) {
            decoded.add(param.getKey() + "=" + param.getValue());
            encoded.add(percentEncode(param.getKey()) + "=" + percentEncode(param.getValue()));
        }
        return new QueryStrings(decoded.toString(), encoded.toString());
    }

    /** Percent-encodes one query component per RFC 3986 (space is %20, never +). */
    private static String percentEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /** Prehash string and its HMAC-SHA256 signature (lowercase hex). */
    private record Signed(String preHash, String signature) {}

    /**
     * Signs a request: HMAC-SHA256 over timestamp + method + path + decodedQuery + rawBody.
     * The query string goes in DECODED (gotcha 1) and rawBody must be the exact
     * string sent on the wire (gotcha 2).
     */
    private static Signed sign(String method, String path, String decodedQuery, String rawBody, long timestamp)
            throws GeneralSecurityException {
        String preHash = timestamp + method + path + decodedQuery + rawBody;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(API_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = HexFormat.of().formatHex(mac.doFinal(preHash.getBytes(StandardCharsets.UTF_8)));
        return new Signed(preHash, signature);
    }
}

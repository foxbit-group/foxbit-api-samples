package br.com.foxbit.samples;

import org.apache.http.client.methods.*;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class FoxbitApiSamples {
    private static final String API_BASE_URL = "https://api.foxbit.com.br";
    private static final String API_KEY = System.getenv("FOXBIT_API_KEY");
    private static final String API_SECRET = System.getenv("FOXBIT_API_SECRET");

    @SuppressWarnings("unchecked")
    public static void main(String[] args) {
        try {
            System.out.println("FOXBIT_API_KEY: " + API_KEY);

            // Get the user information
            String meResponse = request("GET", "/rest/v3/me", null, null);
            System.out.println("Response: " + meResponse);

            // Request to create a new order
            JSONObject order = new JSONObject();
            order.put("market_symbol", "btcbrl");
            order.put("side", "BUY");
            order.put("type", "LIMIT");
            order.put("price", "10.0");
            order.put("quantity", "0.0001");
            String orderResponse = request("POST", "/rest/v3/orders", null, order.toJSONString());
            System.out.println("Response: " + orderResponse);

            Thread.sleep(2000);

            // Get active orders
            Map<String, String> ordersParam = new HashMap<>();
            ordersParam.put("market_symbol", "btcbrl");
            ordersParam.put("state", "ACTIVE");
            String ordersResponse = request("GET", "/rest/v3/orders", ordersParam, null);
            System.out.println("Response: " + ordersResponse);

            // Parse response to get the order ID
            JSONObject orderResponseJson = (JSONObject) new JSONParser().parse(orderResponse);
            String orderId = (String) orderResponseJson.get("id");

            // Request to cancel the order
            JSONObject orderToCancel = new JSONObject();
            orderToCancel.put("type", "ID");
            orderToCancel.put("id", orderId);
            String cancelResponse = request("PUT", "/rest/v3/orders/cancel", null, orderToCancel.toJSONString());
            System.out.println("Response: " + cancelResponse);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static Map<String, String> sign(String method, String path, Map<String, String> params, String body) throws Exception {
        StringBuilder queryString = new StringBuilder();
        if (params != null) {
            for (Map.Entry<String, String> param : params.entrySet()) {
                if (queryString.length() > 0) {
                    queryString.append("&");
                }
                queryString.append(URLEncoder.encode(param.getKey(), "UTF-8"))
                           .append("=")
                           .append(URLEncoder.encode(param.getValue(), "UTF-8"));
            }
        }

        String rawBody = body != null ? body : "";
        long timestamp = System.currentTimeMillis();
        String preHash = timestamp + method + path + queryString + rawBody;
        System.out.println("PreHash: " + preHash);

        Mac sha256_HMAC = Mac.getInstance("HmacSHA256");
        SecretKeySpec secret_key = new SecretKeySpec(API_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        sha256_HMAC.init(secret_key);
        byte[] hash = sha256_HMAC.doFinal(preHash.getBytes(StandardCharsets.UTF_8));

        StringBuilder hexString = new StringBuilder();
        for (byte b : hash) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) hexString.append('0');
            hexString.append(hex);
        }
        System.out.println("Signature: " + hexString.toString());
    
        Map<String, String> signatureData = new HashMap<>();
        signatureData.put("signature", hexString.toString());
        signatureData.put("timestamp", Long.toString(timestamp));
        signatureData.put("queryString", queryString.toString());

        return signatureData;
    }

    private static String request(String method, String path, Map<String, String> params, String body) throws Exception {
        System.out.println("--------------------------------------------------");

        Map<String, String> signatureData = sign(method, path, params, body);
        String queryString = signatureData.get("queryString");        
        StringBuilder urlBuilder = new StringBuilder(API_BASE_URL).append(path);
        if (!queryString.isEmpty()) {
            urlBuilder.append("?").append(queryString);
        }
        String url = urlBuilder.toString();
        System.out.println("Requesting: " + method + " " + url);

        HttpRequestBase request;
        if ("GET".equalsIgnoreCase(method)) {
            request = new HttpGet(url);
        } else if ("POST".equalsIgnoreCase(method)) {
            request = new HttpPost(url);
            ((HttpPost) request).setEntity(new StringEntity(body));
        } else if ("PUT".equalsIgnoreCase(method)) {
            request = new HttpPut(url);
            ((HttpPut) request).setEntity(new StringEntity(body));
        } else {
            throw new IllegalArgumentException("Unsupported HTTP method: " + method);
        }
        String signature = signatureData.get("signature");
        String timestamp = signatureData.get("timestamp");
        request.setHeader("X-FB-ACCESS-KEY", API_KEY);
        request.setHeader("X-FB-ACCESS-TIMESTAMP", timestamp);
        request.setHeader("X-FB-ACCESS-SIGNATURE", signature);
        request.setHeader("Content-Type", "application/json");

        CloseableHttpClient client = HttpClients.createDefault();
        CloseableHttpResponse response = client.execute(request);
        String responseString = EntityUtils.toString(response.getEntity());
        client.close();

        return responseString;
    }
}

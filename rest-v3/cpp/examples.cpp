#include <iostream>
#include <iomanip>
#include <cstdlib>
#include <cstring>
#include <string>
#include <map>
#include <chrono>
#include <thread>
#include <sstream>

#include <openssl/hmac.h>
#include <openssl/evp.h>

#include <curl/curl.h>

#include "json.hpp" // https://github.com/nlohmann/json
using json = nlohmann::json;

const std::string API_BASE_URL = "https://api.foxbit.com.br";

/*--------------------------------------------------
 * Helpers
 *------------------------------------------------*/
std::string urlEncode(CURL* curl, const std::string& value)
{
    char* encoded = curl_easy_escape(curl, value.c_str(),
                                     static_cast<int>(value.size()));
    std::string res(encoded);
    curl_free(encoded);
    return res;
}

std::string buildQuery(CURL* curl,
                       const std::map<std::string,std::string>& params)
{
    if (params.empty()) return "";
    std::ostringstream oss;
    bool first = true;
    for (const auto& [k,v] : params)
    {
        if (!first) oss << "&";
        first = false;
        oss << urlEncode(curl, k) << "=" << urlEncode(curl, v);
    }
    return oss.str();
}

std::string hmacSha256(const std::string& key, const std::string& data)
{
    unsigned char* digest;
    digest = HMAC(EVP_sha256(),
                  reinterpret_cast<const unsigned char*>(key.data()), key.size(),
                  reinterpret_cast<const unsigned char*>(data.data()), data.size(),
                  nullptr, nullptr);

    std::ostringstream oss;
    for (int i = 0; i < 32; ++i)
        oss << std::hex << std::setw(2) << std::setfill('0')
            << static_cast<int>(digest[i]);
    return oss.str();
}

std::pair<std::string,std::string> sign(const std::string& method,
                                        const std::string& path,
                                        const std::map<std::string,std::string>& params,
                                        const std::string& rawBody)
{
    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
                   std::chrono::system_clock::now().time_since_epoch()).count();
    std::string timestamp = std::to_string(now);

    // Build query string exactly as sent
    CURL* curl = curl_easy_init();
    std::string queryString = buildQuery(curl, params);
    curl_easy_cleanup(curl);

    std::string preHash = timestamp + method + path + queryString + rawBody;
    std::cout << "PreHash: " << preHash << '\n';

    const char* secret = std::getenv("FOXBIT_API_SECRET");
    if (!secret) throw std::runtime_error("FOXBIT_API_SECRET not set");

    std::string signature = hmacSha256(secret, preHash);
    std::cout << "Signature: " << signature << '\n';

    return {signature, timestamp};
}

/*--------------------------------------------------
 * libcurl write callback
 *------------------------------------------------*/
size_t writeCallback(void* contents, size_t size, size_t nmemb, void* userp)
{
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

/*--------------------------------------------------
 * Generic request helper
 *------------------------------------------------*/
std::string request(const std::string& method,
                    const std::string& path,
                    const std::map<std::string,std::string>& params = {},
                    const json* bodyJson = nullptr)
{
    std::cout << "--------------------------------------------------\n";
    std::cout << "Requesting: " << method << " " << path << '\n';

    std::string rawBody = bodyJson ? bodyJson->dump() : "";
    auto [signature, timestamp] = sign(method, path, params, rawBody);

    CURL* curl = curl_easy_init();
    if (!curl) throw std::runtime_error("Failed to init curl");

    std::string queryString = buildQuery(curl, params);
    std::string url = API_BASE_URL + path;
    if (!queryString.empty()) url += "?" + queryString;

    struct curl_slist* headers = nullptr;
    const char* apiKey = std::getenv("FOXBIT_API_KEY");
    if (!apiKey) throw std::runtime_error("FOXBIT_API_KEY not set");

    headers = curl_slist_append(headers,
        ("X-FB-ACCESS-KEY: " + std::string(apiKey)).c_str());
    headers = curl_slist_append(headers,
        ("X-FB-ACCESS-TIMESTAMP: " + timestamp).c_str());
    headers = curl_slist_append(headers,
        ("X-FB-ACCESS-SIGNATURE: " + signature).c_str());
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCallback);

    if (bodyJson)
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, rawBody.c_str());

    std::string responseStr;
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &responseStr);

    CURLcode res = curl_easy_perform(curl);
    long httpCode = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &httpCode);

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK)
        throw std::runtime_error("curl error: " +
                                 std::string(curl_easy_strerror(res)));

    if (httpCode != 200 && httpCode != 201)
    {
        std::cerr << "HTTP Status Code: " << httpCode
                  << ", Error Response Body: " << responseStr << '\n';
        throw std::runtime_error("request failed");
    }

    return responseStr;
}

/*--------------------------------------------------
 * Convenience wrappers
 *------------------------------------------------*/
json createOrder(const std::string& marketSymbol,
                 const std::string& side,
                 const std::string& type,
                 const std::string& price,
                 const std::string& quantity)
{
    json order = {
        {"market_symbol", marketSymbol},
        {"side",          side},
        {"type",          type},
        {"price",         price},
        {"quantity",      quantity}
    };
    return json::parse(request("POST", "/rest/v3/orders", {}, &order));
}

json getActiveOrders(const std::string& marketSymbol)
{
    std::map<std::string,std::string> params = {
        {"market_symbol", marketSymbol},
        {"state",         "ACTIVE"}
    };
    return json::parse(request("GET", "/rest/v3/orders", params, nullptr));
}

json cancelOrder(const std::string& orderId)
{
    json payload = {
        {"type", "ID"},
        {"id",   orderId}
    };
    return json::parse(request("PUT", "/rest/v3/orders/cancel", {}, &payload));
}

/*--------------------------------------------------
 * Main demo flow
 *------------------------------------------------*/
int main()
{
    try
    {
        std::cout << "FOXBIT_API_KEY: " << std::getenv("FOXBIT_API_KEY") << "\n";

        // GET /me
        json me = json::parse(request("GET", "/rest/v3/me"));
        std::cout << "Response: " << me.dump(2) << "\n";

        // Create order
        json orderResp = createOrder("btcbrl", "BUY", "LIMIT", "450000.0", "0.00001");
        std::cout << "Order Response: " << orderResp.dump(2) << "\n";

        std::this_thread::sleep_for(std::chrono::seconds(2));

        // Active orders
        json active = getActiveOrders("btcbrl");
        std::cout << "Active Orders Response: " << active.dump(2) << "\n";

        // Cancel order
        std::string orderId = orderResp["id"];
        json cancelResp = cancelOrder(orderId);
        std::cout << "Cancel Response: " << cancelResp.dump(2) << "\n";
    }
    catch (const std::exception& ex)
    {
        std::cerr << "Failed to process request: " << ex.what() << '\n';
        return EXIT_FAILURE;
    }
    return EXIT_SUCCESS;
}

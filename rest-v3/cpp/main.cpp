// Foxbit REST API v3 example.
//
// Runs a full order lifecycle against https://api.foxbit.com.br: fetches
// account info, reads the public orderbook, places a LIMIT BUY order priced
// far below the market, lists active orders and cancels the order.
//
// API docs: https://docs.foxbit.com.br/rest/v3/

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include <curl/curl.h>
#include <openssl/evp.h>

#include "json.hpp" // nlohmann/json single header (pinned in the Dockerfile)

using json = nlohmann::json;

// Ordered list of query parameters. The URL and the prehash must list the
// parameters in the same order, so an order-preserving structure is used.
using Params = std::vector<std::pair<std::string, std::string>>;

const std::string API_BASE_URL = "https://api.foxbit.com.br";

std::string apiKey;    // FOXBIT_API_KEY
std::string apiSecret; // FOXBIT_API_SECRET

// Percent-encode one URL component per RFC 3986 (space is %20, never +).
std::string percentEncode(CURL* curl, const std::string& value) {
    char* encoded = curl_easy_escape(curl, value.c_str(), static_cast<int>(value.size()));
    if (encoded == nullptr) {
        throw std::runtime_error("curl_easy_escape failed");
    }
    std::string result(encoded);
    curl_free(encoded);
    return result;
}

// Build the percent-encoded query string that goes into the URL.
std::string encodedQuery(CURL* curl, const Params& params) {
    std::string query;
    for (const auto& [key, value] : params) {
        if (!query.empty()) query += "&";
        query += percentEncode(curl, key) + "=" + percentEncode(curl, value);
    }
    return query;
}

// Build the raw (decoded) query string that goes into the prehash.
std::string decodedQuery(const Params& params) {
    std::string query;
    for (const auto& [key, value] : params) {
        if (!query.empty()) query += "&";
        query += key + "=" + value;
    }
    return query;
}

// HMAC-SHA256 as a lowercase hex string (one-shot OpenSSL 3 EVP API).
std::string hmacSha256Hex(const std::string& key, const std::string& message) {
    unsigned char digest[EVP_MAX_MD_SIZE];
    size_t digestLen = 0;
    if (EVP_Q_mac(nullptr, "HMAC", nullptr, "SHA256", nullptr,
                  key.data(), key.size(),
                  reinterpret_cast<const unsigned char*>(message.data()), message.size(),
                  digest, sizeof(digest), &digestLen) == nullptr) {
        throw std::runtime_error("HMAC-SHA256 computation failed");
    }
    std::ostringstream hex;
    hex << std::hex << std::setfill('0');
    for (size_t i = 0; i < digestLen; ++i) {
        hex << std::setw(2) << static_cast<int>(digest[i]);
    }
    return hex.str();
}

// Return the HMAC-SHA256 signature (hex) for a request.
//
//   prehash = timestamp + method + path + query + rawBody
//
// Gotcha 1: `query` must be the DECODED query string (raw values, no
// percent-encoding) even though the URL carries the encoded form -- the
// server rebuilds the prehash from decoded values.
// Gotcha 2: `rawBody` must be the exact string sent on the wire --
// serialize the body once, then sign and send that same string.
std::string sign(const std::string& method, const std::string& path,
                 const std::string& query, const std::string& rawBody,
                 const std::string& timestamp) {
    const std::string preHash = timestamp + method + path + query + rawBody;
    std::cout << "PreHash: " << preHash << "\n";
    return hmacSha256Hex(apiSecret, preHash);
}

// libcurl write callback: append the response body to a std::string.
size_t writeCallback(char* data, size_t size, size_t nmemb, void* userdata) {
    static_cast<std::string*>(userdata)->append(data, size * nmemb);
    return size * nmemb;
}

// Send a request to the API and return the parsed JSON response.
//
// The encoded query (for the URL) and the decoded query (for the prehash)
// are built from the same ordered `params`, and the body is serialized
// exactly once, so the signed strings can never diverge from those sent.
json request(const std::string& method, const std::string& path,
             const Params& params = {}, const json* body = nullptr,
             bool authenticated = true) {
    std::cout << std::string(50, '-') << "\n" << method << " " << path << "\n";

    std::unique_ptr<CURL, decltype(&curl_easy_cleanup)> curl(curl_easy_init(),
                                                             curl_easy_cleanup);
    if (!curl) {
        throw std::runtime_error("curl_easy_init failed");
    }

    std::string url = API_BASE_URL + path;
    const std::string urlQuery = encodedQuery(curl.get(), params);
    if (!urlQuery.empty()) url += "?" + urlQuery;

    // Serialize the body exactly once; this same string is signed and sent.
    const std::string rawBody = body != nullptr ? body->dump() : "";

    std::vector<std::string> headerLines = {"Content-Type: application/json"};
    if (authenticated) {
        const auto now = std::chrono::system_clock::now().time_since_epoch();
        const std::string timestamp = std::to_string(
            std::chrono::duration_cast<std::chrono::milliseconds>(now).count());
        const std::string signature =
            sign(method, path, decodedQuery(params), rawBody, timestamp);
        headerLines.push_back("X-FB-ACCESS-KEY: " + apiKey);
        headerLines.push_back("X-FB-ACCESS-TIMESTAMP: " + timestamp);
        headerLines.push_back("X-FB-ACCESS-SIGNATURE: " + signature);
    }
    curl_slist* headerList = nullptr;
    for (const auto& line : headerLines) {
        headerList = curl_slist_append(headerList, line.c_str());
    }
    std::unique_ptr<curl_slist, decltype(&curl_slist_free_all)> headers(
        headerList, curl_slist_free_all);

    std::string responseBody;
    curl_easy_setopt(curl.get(), CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl.get(), CURLOPT_CUSTOMREQUEST, method.c_str());
    curl_easy_setopt(curl.get(), CURLOPT_HTTPHEADER, headers.get());
    curl_easy_setopt(curl.get(), CURLOPT_WRITEFUNCTION, writeCallback);
    curl_easy_setopt(curl.get(), CURLOPT_WRITEDATA, &responseBody);
    if (body != nullptr) {
        // POSTFIELDS keeps a pointer to rawBody, which outlives the transfer.
        curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDSIZE,
                         static_cast<long>(rawBody.size()));
        curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDS, rawBody.c_str());
    }

    const CURLcode result = curl_easy_perform(curl.get());
    if (result != CURLE_OK) {
        throw std::runtime_error(std::string("curl: ") + curl_easy_strerror(result));
    }
    long status = 0;
    curl_easy_getinfo(curl.get(), CURLINFO_RESPONSE_CODE, &status);
    std::cout << "Response (" << status << "): " << responseBody << "\n";
    if (status < 200 || status >= 300) {
        throw std::runtime_error(method + " " + path + " failed with status " +
                                 std::to_string(status));
    }
    return json::parse(responseBody);
}

int main() {
    const char* keyEnv = std::getenv("FOXBIT_API_KEY");
    const char* secretEnv = std::getenv("FOXBIT_API_SECRET");
    if (keyEnv == nullptr || secretEnv == nullptr || *keyEnv == '\0' || *secretEnv == '\0') {
        std::cerr << "Set the FOXBIT_API_KEY and FOXBIT_API_SECRET environment variables.\n";
        return EXIT_FAILURE;
    }
    apiKey = keyEnv;
    apiSecret = secretEnv;

    curl_global_init(CURL_GLOBAL_DEFAULT);
    int exitCode = EXIT_SUCCESS;
    try {
        // 1. Fetch account information (authenticated, no params).
        request("GET", "/rest/v3/me");

        // 2. Fetch the top of the btcbrl orderbook (public endpoint, no auth).
        const json orderbook = request("GET", "/rest/v3/markets/btcbrl/orderbook",
                                       {{"depth", "1"}}, nullptr, false);
        const double bestBid = std::stod(orderbook["bids"][0][0].get<std::string>());

        // 3. Price the order at 50% of the best bid: inside the price band the
        //    API accepts (an absurd price like 10.0 is rejected with 422) yet
        //    far too low to ever fill. btcbrl uses price_increment 1.0, so the
        //    price must be a whole number.
        const std::string price =
            std::to_string(static_cast<long long>(std::floor(bestBid * 0.5)));

        // 4. Place a LIMIT BUY order for 0.0001 BTC. nlohmann/json sorts object
        //    keys on dump() -- harmless, because the exact string produced here
        //    is both signed and sent.
        const json orderBody = {{"market_symbol", "btcbrl"},
                                {"side", "BUY"},
                                {"type", "LIMIT"},
                                {"price", price},
                                {"quantity", "0.0001"}};
        const json order = request("POST", "/rest/v3/orders", {}, &orderBody);
        const std::string orderId = order["id"].get<std::string>();

        // 5. Give the order a moment to show up in the active list.
        std::this_thread::sleep_for(std::chrono::seconds(2));

        // 6. List active orders -- the order placed above should appear.
        request("GET", "/rest/v3/orders",
                {{"market_symbol", "btcbrl"}, {"state", "ACTIVE"}});

        // 7. Cancel the order placed in step 4.
        const json cancelBody = {{"type", "ID"}, {"id", orderId}};
        request("PUT", "/rest/v3/orders/cancel", {}, &cancelBody);
    } catch (const std::exception& error) {
        std::cerr << "Error: " << error.what() << "\n";
        exitCode = EXIT_FAILURE;
    }
    curl_global_cleanup();
    return exitCode;
}

// Foxbit REST API v3 — C# example.
//
// Signs requests with HMAC-SHA256 and walks through a simple order flow:
// authenticate, read the public orderbook, place a LIMIT order, list it, cancel it.
//
// Signing gotchas (validated against the live API):
//   1. The query string goes into the signature pre-hash DECODED (raw values,
//      no percent-encoding), but is sent percent-encoded (RFC 3986) in the URL.
//   2. The body is signed exactly as sent: serialize it once and use the same
//      string for both the signature and the request content.

using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

const string BaseUrl = "https://api.foxbit.com.br";

// Fail fast if credentials are missing. Never print them.
var apiKey = RequireEnv("FOXBIT_API_KEY");
var apiSecret = RequireEnv("FOXBIT_API_SECRET");

using var http = new HttpClient { BaseAddress = new Uri(BaseUrl) };

try
{
    // 1. Check the credentials with an authenticated request.
    await RequestAsync("GET", "/rest/v3/me");

    // 2. Fetch the best bid from the public orderbook (no authentication needed).
    var orderbookJson = await RequestAsync("GET", "/rest/v3/markets/btcbrl/orderbook",
        query: [("depth", "1")], authenticated: false);
    using var orderbook = JsonDocument.Parse(orderbookJson);
    var bestBid = decimal.Parse(orderbook.RootElement.GetProperty("bids")[0][0].GetString()!,
        CultureInfo.InvariantCulture);

    // 3. Bid at 50% of the best bid, rounded down to a whole number (the btcbrl
    //    price increment is 1.0). That keeps the order inside the exchange's
    //    accepted price band — an absurd price like 10.0 is rejected with a 422 —
    //    while staying far too low to ever execute.
    var price = Math.Floor(bestBid / 2).ToString("F0", CultureInfo.InvariantCulture);
    Console.WriteLine($"Best bid: {bestBid} BRL, order price: {price} BRL");

    // 4. Place a LIMIT BUY order for 0.0001 BTC.
    var orderJson = await RequestAsync("POST", "/rest/v3/orders", body: new Dictionary<string, string>
    {
        ["market_symbol"] = "btcbrl",
        ["side"] = "BUY",
        ["type"] = "LIMIT",
        ["price"] = price,
        ["quantity"] = "0.0001",
    });
    using var order = JsonDocument.Parse(orderJson);
    var orderId = order.RootElement.GetProperty("id").GetString()!;

    // 5. Give the exchange a moment to process the order.
    await Task.Delay(2000);

    // 6. The new order should show up among the active orders.
    await RequestAsync("GET", "/rest/v3/orders",
        query: [("market_symbol", "btcbrl"), ("state", "ACTIVE")]);

    // 7. Cancel the order by its id.
    await RequestAsync("PUT", "/rest/v3/orders/cancel", body: new Dictionary<string, string>
    {
        ["type"] = "ID",
        ["id"] = orderId,
    });

    return 0;
}
catch (HttpRequestException)
{
    // The status code and response body were already logged by RequestAsync.
    return 1;
}

// Sends a request, signing it when `authenticated` is true. Query parameters are
// an ordered list of raw (unencoded) key/value pairs: the same list produces both
// the decoded query string for the signature and the encoded one for the URL, so
// the two can never diverge.
async Task<string> RequestAsync(string method, string path,
    IReadOnlyList<(string Key, string Value)>? query = null,
    object? body = null, bool authenticated = true)
{
    var decodedQuery = BuildQueryString(query, encoded: false); // goes into the pre-hash
    var encodedQuery = BuildQueryString(query, encoded: true);  // goes into the URL
    // Serialize the body exactly once: the string that is signed is the one sent.
    var rawBody = body is null ? "" : JsonSerializer.Serialize(body);

    Console.WriteLine(new string('-', 50));
    Console.WriteLine($"{method} {path}");

    var uri = path + (encodedQuery.Length > 0 ? "?" + encodedQuery : "");
    var request = new HttpRequestMessage(new HttpMethod(method), uri);
    if (rawBody.Length > 0)
    {
        request.Content = new StringContent(rawBody, Encoding.UTF8, "application/json");
    }

    if (authenticated)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            .ToString(CultureInfo.InvariantCulture);
        var signature = Sign(apiSecret, method, path, decodedQuery, rawBody, timestamp);
        request.Headers.Add("X-FB-ACCESS-KEY", apiKey);
        request.Headers.Add("X-FB-ACCESS-TIMESTAMP", timestamp);
        request.Headers.Add("X-FB-ACCESS-SIGNATURE", signature);
    }

    using var response = await http.SendAsync(request);
    var content = await response.Content.ReadAsStringAsync();
    Console.WriteLine($"Response ({(int)response.StatusCode}): {content}");

    if (!response.IsSuccessStatusCode)
    {
        throw new HttpRequestException($"{method} {path} failed with HTTP {(int)response.StatusCode}");
    }
    return content;
}

// Joins query parameters in order. With encoded=false the raw values are used
// (the decoded form the server signs); with encoded=true each key and value is
// RFC 3986 percent-encoded for the URL (space becomes %20, never '+').
static string BuildQueryString(IReadOnlyList<(string Key, string Value)>? query, bool encoded)
{
    if (query is null || query.Count == 0)
    {
        return "";
    }
    return string.Join("&", query.Select(p => encoded
        ? $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"
        : $"{p.Key}={p.Value}"));
}

// HMAC-SHA256 (lowercase hex) over: timestamp + method + path + decodedQuery + rawBody.
static string Sign(string secret, string method, string path, string decodedQuery,
    string rawBody, string timestamp)
{
    var preHash = timestamp + method + path + decodedQuery + rawBody;
    Console.WriteLine($"PreHash: {preHash}");
    var hash = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(preHash));
    return Convert.ToHexString(hash).ToLowerInvariant();
}

// Reads a required environment variable or exits with a clear error message.
static string RequireEnv(string name)
{
    var value = Environment.GetEnvironmentVariable(name);
    if (string.IsNullOrEmpty(value))
    {
        Console.Error.WriteLine($"Error: the {name} environment variable must be set.");
        Environment.Exit(1);
    }
    return value;
}

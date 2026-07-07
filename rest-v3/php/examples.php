<?php

/**
 * Foxbit REST API v3 — PHP example.
 *
 * Authenticates with an HMAC-SHA256 signature, reads public market data,
 * places a limit buy order far from the market price and cancels it.
 *
 * Uses only PHP built-ins: ext-curl, hash_hmac() and json_encode().
 */

declare(strict_types=1);

const API_BASE_URL = 'https://api.foxbit.com.br';

function logLine(string $message): void
{
    echo $message . "\n";
}

/**
 * HMAC-SHA256 signature over: timestamp + method + path + query + rawBody.
 *
 * Signing gotcha #1: $decodedQuery must contain the RAW (decoded) values —
 * the server reconstructs the pre-hash from the decoded query string, so
 * signing the percent-encoded form results in HTTP 401.
 *
 * Signing gotcha #2: $rawBody must be the exact string sent on the wire —
 * the server verifies the signature against the received bytes.
 */
function sign(
    string $method,
    string $path,
    string $decodedQuery,
    string $rawBody,
    string $timestamp,
    string $secret
): string {
    $preHash = $timestamp . $method . $path . $decodedQuery . $rawBody;
    logLine('PreHash: ' . $preHash);

    return hash_hmac('sha256', $preHash, $secret);
}

/**
 * Builds both forms of the query string from the same ordered params:
 * - encoded: RFC 3986 percent-encoded, for the request URL;
 * - decoded: raw values, for the signature pre-hash.
 *
 * Both must list the pairs in the same order, so they are built together.
 * Returns [encoded, decoded].
 */
function buildQueryStrings(array $params): array
{
    $encodedPairs = [];
    $decodedPairs = [];
    foreach ($params as $key => $value) {
        $encodedPairs[] = rawurlencode((string) $key) . '=' . rawurlencode((string) $value);
        $decodedPairs[] = $key . '=' . $value;
    }

    return [implode('&', $encodedPairs), implode('&', $decodedPairs)];
}

/**
 * Sends a request and returns the decoded JSON response.
 * Prints the error and exits with a non-zero code on any failure.
 */
function request(string $method, string $path, array $params = [], ?array $body = null, bool $auth = true): array
{
    [$encodedQuery, $decodedQuery] = buildQueryStrings($params);

    // Serialize the body exactly once: the signed string and the sent bytes
    // must be identical, otherwise the server rejects the signature.
    $rawBody = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR);

    $url = API_BASE_URL . $path . ($encodedQuery === '' ? '' : '?' . $encodedQuery);

    logLine('--------------------------------------------------');
    logLine($method . ' ' . $path . ($encodedQuery === '' ? '' : '?' . $encodedQuery));

    $headers = ['Content-Type: application/json'];
    if ($auth) {
        $timestamp = (string) (int) round(microtime(true) * 1000);
        $signature = sign($method, $path, $decodedQuery, $rawBody, $timestamp, getenv('FOXBIT_API_SECRET'));
        $headers[] = 'X-FB-ACCESS-KEY: ' . getenv('FOXBIT_API_KEY');
        $headers[] = 'X-FB-ACCESS-TIMESTAMP: ' . $timestamp;
        $headers[] = 'X-FB-ACCESS-SIGNATURE: ' . $signature;
    }

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
    ]);
    if ($rawBody !== '') {
        curl_setopt($curl, CURLOPT_POSTFIELDS, $rawBody);
    }

    $responseBody = curl_exec($curl);
    if ($responseBody === false) {
        fwrite(STDERR, 'Request failed: ' . curl_error($curl) . "\n");
        exit(1);
    }
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    logLine("Response ({$status}): {$responseBody}");
    if ($status < 200 || $status >= 300) {
        fwrite(STDERR, "Request failed with HTTP {$status}.\n");
        exit(1);
    }

    return json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR);
}

// Fail fast if credentials are missing. Never print the key or the secret.
foreach (['FOXBIT_API_KEY', 'FOXBIT_API_SECRET'] as $envVar) {
    if (getenv($envVar) === false || getenv($envVar) === '') {
        fwrite(STDERR, "Error: environment variable {$envVar} is not set.\n");
        exit(1);
    }
}

// 1. Get account information (authenticated).
request('GET', '/rest/v3/me');

// 2. Fetch the order book — a public endpoint, so no authentication headers.
$orderbook = request('GET', '/rest/v3/markets/btcbrl/orderbook', ['depth' => '1'], null, false);
$bestBid = $orderbook['bids'][0][0];

// 3. Price the order at 50% of the best bid, formatted as an integer
// (btcbrl has price_increment 1.0). The API enforces price bands, so an
// absurdly low hardcoded price such as "10.0" is rejected with HTTP 422;
// half the market price stays inside the band yet far from execution.
$price = (string) (int) floor((float) $bestBid * 0.5);
logLine("Best bid: {$bestBid} — order price (50% of it): {$price}");

// 4. Place a limit buy order. This is a real order; it is canceled in step 7.
$order = request('POST', '/rest/v3/orders', [], [
    'market_symbol' => 'btcbrl',
    'side' => 'BUY',
    'type' => 'LIMIT',
    'price' => $price,
    'quantity' => '0.0001',
]);
$orderId = (string) $order['id'];

// 5. Give the matching engine a moment to process the order.
sleep(2);

// 6. List active orders — the order placed in step 4 should be in the list.
request('GET', '/rest/v3/orders', ['market_symbol' => 'btcbrl', 'state' => 'ACTIVE']);

// 7. Cancel the order created in step 4.
request('PUT', '/rest/v3/orders/cancel', [], ['type' => 'ID', 'id' => $orderId]);

logLine('Done.');

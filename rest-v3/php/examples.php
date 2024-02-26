<?php
require 'vendor/autoload.php';

use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Psr7;

$apiBaseUrl = 'https://api.foxbit.com.br';

function sign($method, $path, $params, $body) {
    $queryString = '';
    if ($params) {
        $queryString = http_build_query($params);
    }

    $rawBody = '';
    if ($body) {
        $rawBody = json_encode($body);
    }

    $timestamp = round(microtime(true) * 1000);
    $preHash = $timestamp . $method . $path . $queryString . $rawBody;
    logLine('PreHash: ' . $preHash);
    $signature = hash_hmac('sha256', $preHash, getenv('FOXBIT_API_SECRET'));
    logLine('Signature: ' . $signature);

    return ['signature' => $signature, 'timestamp' => $timestamp];
}

function request($method, $path, $params, $body) {
    global $apiBaseUrl;

    logLine('--------------------------------------------------');
    logLine('Requesting: ' . $method . ' ' . $path);
    $sign = sign($method, $path, $params, $body);
    $client = new Client();
    $url = $apiBaseUrl . $path;
    $headers = [
        'X-FB-ACCESS-KEY' => getenv('FOXBIT_API_KEY'),
        'X-FB-ACCESS-TIMESTAMP' => $sign['timestamp'],
        'X-FB-ACCESS-SIGNATURE' => $sign['signature'],
        'Content-Type' => 'application/json',
    ];

    try {
        $options = [
            'headers' => $headers,
            'body' => json_encode($body),
            'query' => $params,
        ];
        $response = $client->request($method, $url, $options);
        return json_decode($response->getBody(), true);
    } catch (RequestException $e) {
        if ($e->hasResponse()) {
            $response = $e->getResponse();
            error_log("HTTP Status Code: " . $response->getStatusCode() . ", Error Response Body: " . $response->getBody());
        }
        throw $e;
    }
}

function logLine($message) {
    echo($message . "\n");
}

try {
    logLine('FOXBIT_API_KEY: ' . getenv('FOXBIT_API_KEY'));

    // Get the user information
    $meResponse = request('GET', '/rest/v3/me', [], []);
    logLine('Response: ' . print_r($meResponse, true));

    // Request to create a new order
    $order = [
        'market_symbol' => 'btcbrl',
        'side' => 'BUY',
        'type' => 'LIMIT',
        'price' => '10.0',
        'quantity' => '0.0001',
    ];
    $orderResponse = request('POST', '/rest/v3/orders', null, $order);
    logLine('Response: ' . print_r($orderResponse, true));

    sleep(2);

    // Get active orders
    $orderParams = [
        'market_symbol' => 'btcbrl',
        'state' => 'ACTIVE',
    ];
    $activeOrdersResponse = request('GET', '/rest/v3/orders', $orderParams, []);
    logLine('Response: ' . print_r($activeOrdersResponse, true));

    // Request to cancel the order
    $orderToCancel = [
        'type' => 'ID',
        'id' => $orderResponse['id']
    ];
    $cancelResponse = request('PUT', '/rest/v3/orders/cancel', null, $orderToCancel);
    logLine('Response: ' . print_r($cancelResponse, true));
} catch (Exception $e) {
    error_log('Failed to process request.');
}

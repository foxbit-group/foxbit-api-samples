// Foxbit REST API v3 example (Dart).
//
// Flow: fetch account info, read the public order book, place a limit buy
// order far below the market price, list active orders and cancel the order.
//
// Docs: https://docs.foxbit.com.br/rest/v3/
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

const baseUrl = 'https://api.foxbit.com.br';

final String apiKey = Platform.environment['FOXBIT_API_KEY'] ?? '';
final String apiSecret = Platform.environment['FOXBIT_API_SECRET'] ?? '';

/// Query string with raw (decoded) values, used in the signature pre-hash.
/// The server reconstructs the pre-hash with DECODED values, so signing the
/// percent-encoded form would produce a 401.
String rawQueryString(Map<String, String> params) =>
    params.entries.map((e) => '${e.key}=${e.value}').join('&');

/// RFC 3986 percent-encoded query string, used in the request URL.
/// Uri.encodeComponent encodes a space as %20. Do NOT use
/// Uri.encodeQueryComponent, which encodes it as '+'.
String encodedQueryString(Map<String, String> params) => params.entries
    .map((e) => '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value)}')
    .join('&');

/// HMAC-SHA256 signature (lowercase hex) over:
///   timestamp + method + path + decoded query string + raw body
String sign({
  required String secret,
  required String timestamp,
  required String method,
  required String path,
  required String query, // decoded (raw) values
  required String body, // the exact string sent on the wire
}) {
  final preHash = '$timestamp$method$path$query$body';
  print('PreHash: $preHash');
  return Hmac(sha256, utf8.encode(secret)).convert(utf8.encode(preHash)).toString();
}

/// Sends a request to the Foxbit API and returns the decoded JSON response.
/// Exits the process on any non-2xx status.
///
/// Signing gotchas:
///  1. The query string goes DECODED into the pre-hash but percent-encoded
///     (RFC 3986) into the URL. Both are built from the same [params] map,
///     so they always contain the same pairs in the same order.
///  2. The body is signed exactly as sent: it is serialized ONCE and the
///     same string is used for both the signature and the request body.
Future<dynamic> request(
  String method,
  String path, {
  Map<String, String> params = const {},
  Map<String, dynamic>? body,
  bool auth = true,
}) async {
  final encodedQuery = encodedQueryString(params);
  final rawBody = body == null ? '' : jsonEncode(body); // serialize ONCE

  print('-' * 50);
  print('$method $path${encodedQuery.isEmpty ? '' : '?$encodedQuery'}');

  final headers = <String, String>{'Content-Type': 'application/json'};
  if (auth) {
    final timestamp = DateTime.now().millisecondsSinceEpoch.toString();
    headers['X-FB-ACCESS-KEY'] = apiKey;
    headers['X-FB-ACCESS-TIMESTAMP'] = timestamp;
    headers['X-FB-ACCESS-SIGNATURE'] = sign(
      secret: apiSecret,
      timestamp: timestamp,
      method: method,
      path: path,
      query: rawQueryString(params),
      body: rawBody,
    );
  }

  final url =
      Uri.parse('$baseUrl$path${encodedQuery.isEmpty ? '' : '?$encodedQuery'}');
  final client = HttpClient();
  try {
    final httpRequest = await client.openUrl(method, url);
    for (final entry in headers.entries) {
      httpRequest.headers.set(entry.key, entry.value);
    }
    if (rawBody.isNotEmpty) {
      final bytes = utf8.encode(rawBody); // the exact bytes that were signed
      httpRequest.headers.contentLength = bytes.length;
      httpRequest.add(bytes);
    }
    final response = await httpRequest.close();
    final responseBody = await response.transform(utf8.decoder).join();
    print('Response (${response.statusCode}): $responseBody');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      stderr.writeln('Request failed, aborting.');
      exit(1);
    }
    return responseBody.isEmpty ? null : jsonDecode(responseBody);
  } finally {
    client.close();
  }
}

Future<void> main() async {
  if (apiKey.isEmpty || apiSecret.isEmpty) {
    stderr.writeln(
        'Missing FOXBIT_API_KEY and/or FOXBIT_API_SECRET environment variables.');
    exit(1);
  }

  // 1. Account info (authenticated request, no params).
  await request('GET', '/rest/v3/me');

  // 2. Order book (public endpoint -- no authentication headers).
  final orderbook = await request(
    'GET',
    '/rest/v3/markets/btcbrl/orderbook',
    params: {'depth': '1'},
    auth: false,
  );
  final bestBid = double.parse(orderbook['bids'][0][0] as String);

  // 3. Price the order at 50% of the best bid: inside the accepted price
  // band (an absurd price like 10.0 is rejected with 422) yet far too low
  // to ever execute. btcbrl has price_increment 1.0, so use an integer.
  final price = (bestBid * 0.5).floor().toString();

  // 4. Place a limit buy order and capture its id.
  final order = await request('POST', '/rest/v3/orders', body: {
    'market_symbol': 'btcbrl',
    'side': 'BUY',
    'type': 'LIMIT',
    'price': price,
    'quantity': '0.0001',
  });
  final orderId = order['id'] as String;

  // 5. Give the matching engine a moment to process the order.
  await Future.delayed(const Duration(seconds: 2));

  // 6. List active orders (the new order should show up).
  await request('GET', '/rest/v3/orders', params: {
    'market_symbol': 'btcbrl',
    'state': 'ACTIVE',
  });

  // 7. Cancel the order by id.
  await request('PUT', '/rest/v3/orders/cancel', body: {
    'type': 'ID',
    'id': orderId,
  });
}

import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

const String apiBaseUrl = 'https://api.foxbit.com.br';

/// Signs the request using HMAC-SHA256 with your API secret.
Map<String, String> signRequest(
  String method,
  String path, {
  Map<String, String>? params,
  Map<String, dynamic>? body,
}) {
  final rawQueryString = (params == null || params.isEmpty)
      ? ''
      : params.entries.map((e) => '${e.key}=${e.value}').join('&');

  final rawBody = body != null ? jsonEncode(body) : '';
  final timestamp = DateTime.now().millisecondsSinceEpoch.toString();

  final preHash = '$timestamp$method$path$rawQueryString$rawBody';
  print('PreHash: $preHash');

  final secret = utf8.encode(Platform.environment['FOXBIT_API_SECRET']!);
  final signature = Hmac(sha256, secret).convert(utf8.encode(preHash)).toString();
  print('Signature: $signature');

  return {
    'X-FB-ACCESS-KEY': Platform.environment['FOXBIT_API_KEY']!,
    'X-FB-ACCESS-TIMESTAMP': timestamp,
    'X-FB-ACCESS-SIGNATURE': signature,
    'Content-Type': 'application/json',
  };
}

/// Sends an HTTP request to the Foxbit API.
Future<Map<String, dynamic>> request(
  String method,
  String path, {
  Map<String, String>? params,
  Map<String, dynamic>? body,
}) async {
  print('--------------------------------------------------');
  print('Requesting: $method $path');

  final headers = signRequest(method, path, params: params, body: body);

  final uri = Uri.parse('$apiBaseUrl$path').replace(queryParameters: params);

  late http.Response resp;
  if (method == 'GET') {
    resp = await http.get(uri, headers: headers);
  } else if (method == 'POST') {
    resp = await http.post(uri, headers: headers, body: jsonEncode(body));
  } else if (method == 'PUT') {
    resp = await http.put(uri, headers: headers, body: jsonEncode(body));
  } else {
    throw ArgumentError('Unsupported HTTP method: $method');
  }

  if (resp.statusCode != 200 && resp.statusCode != 201) {
    stderr.writeln('HTTP ${resp.statusCode}: ${resp.body}');
    throw HttpException('Request failed with status ${resp.statusCode}');
  }
  return jsonDecode(resp.body) as Map<String, dynamic>;
}

Future<Map<String, dynamic>> createOrder() {
  return request(
    'POST',
    '/rest/v3/orders',
    body: {
      'market_symbol': 'btcbrl',
      'side': 'BUY',
      'type': 'LIMIT',
      'price': '500000.0',
      'quantity': '0.00001',
    },
  );
}

Future<List<dynamic>> getActiveOrders() {
  return request(
    'GET',
    '/rest/v3/orders',
    params: {
      'market_symbol': 'btcbrl',
      'state': 'ACTIVE',
    },
  ).then((data) => data['data'] as List<dynamic>);
}

Future<Map<String, dynamic>> cancelOrder(String orderId) {
  return request(
    'PUT',
    '/rest/v3/orders/cancel',
    body: {
      'type': 'ID',
      'id': orderId,
    },
  );
}

Future<void> main() async {
  if (Platform.environment['FOXBIT_API_KEY'] == null ||
      Platform.environment['FOXBIT_API_SECRET'] == null) {
    stderr.writeln('Please set FOXBIT_API_KEY and FOXBIT_API_SECRET');
    exit(1);
  }

  try {
    print('FOXBIT_API_KEY: ${Platform.environment['FOXBIT_API_KEY']}');

    // Get the user information
    final meResponse = await request('GET', '/rest/v3/me');
    print('Response: $meResponse');

    // Get current price
    final marketSymbol = 'btcbrl';
    final tickerResponse =
        await request('GET', '/rest/v3/markets/$marketSymbol/ticker/24hr');
    final tickerList = tickerResponse['data'] as List<dynamic>?;
    final ticker = (tickerList != null && tickerList.isNotEmpty) ? tickerList[0] : null;
    print('Response: $ticker');

    // Request to create a new order
    final lastPrice = double.parse(ticker['best']['bid']['price'] as String);
    final targetPrice = (lastPrice * 0.9).toString();
    final order = {
      'market_symbol': marketSymbol,
      'side': 'BUY',
      'type': 'LIMIT',
      'price': targetPrice,
      'quantity': '0.0001',
    };
    final orderResponse =
        await request('POST', '/rest/v3/orders', body: order);
    print('Response: $orderResponse');

    await Future.delayed(const Duration(seconds: 2));

    // Get active orders
    final oneHourAgoISO = DateTime.now()
        .toUtc()
        .subtract(const Duration(hours: 1))
        .toIso8601String();
    final ordersParam = <String, String>{
      'market_symbol': marketSymbol,
      'state': 'ACTIVE',
      'start_time': oneHourAgoISO,
    };
    final ordersResponse =
        await request('GET', '/rest/v3/orders', params: ordersParam);
    print('Response: $ordersResponse');

    // Request to cancel the order
    final orderToCancel = {
      'type': 'ID',
      'id': orderResponse['id'],
    };
    final cancelResponse = await request(
      'PUT',
      '/rest/v3/orders/cancel',
      body: orderToCancel,
    );
    print('Response: $cancelResponse');
  } catch (error) {
    stderr.writeln('Failed to process request.');
    exit(2);
  }
}

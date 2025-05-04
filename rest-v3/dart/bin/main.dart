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
  final queryString = params?.entries
          .map((e) => '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value)}')
          .join('&') ??
      '';
  final rawBody = body != null ? jsonEncode(body) : '';
  final timestamp = DateTime.now().millisecondsSinceEpoch.toString();

  final preHash = '$timestamp$method$path$queryString$rawBody';
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

    // Get user info
    final me = await request('GET', '/rest/v3/me');
    print('User Info: $me');

    // Create a LIMIT BUY order
    final order = await createOrder();
    print('Order Created: $order');

    // Wait a bit, then fetch active orders
    await Future.delayed(const Duration(seconds: 2));
    final active = await getActiveOrders();
    print('Active Orders: $active');

    // Cancel the first order
    final String orderId = order['id'] as String;
    final cancel = await cancelOrder(orderId);
    print('Cancel Response: $cancel');
  } catch (e) {
    stderr.writeln('Error: $e');
    exit(2);
  }
}

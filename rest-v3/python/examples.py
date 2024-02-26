import os
import json
import requests
import time
import hmac
import hashlib
from urllib.parse import urlencode

api_key = os.getenv('FOXBIT_API_KEY')
api_secret = os.getenv('FOXBIT_API_SECRET')
api_base_url = 'https://api.foxbit.com.br'

def sign(method, path, params, body):
    queryString = ''
    if params:
        queryString = urlencode(params)

    rawBody = ''
    if body:
        rawBody = json.dumps(body)

    timestamp = str(int(time.time() * 1000))
    preHash = f"{timestamp}{method.upper()}{path}{queryString}{rawBody}"
    print('PreHash:', preHash)
    signature = hmac.new(api_secret.encode(), preHash.encode(), hashlib.sha256).hexdigest()
    print('Signature:', signature)

    return signature, timestamp

def request(method, path, params, body):
    print('--------------------------------------------------')
    print('Requesting:', method, path)
    signature, timestamp = sign(method, path, params, body)
    url = f"{api_base_url}{path}"
    headers = {
        'X-FB-ACCESS-KEY': api_key,
        'X-FB-ACCESS-TIMESTAMP': timestamp,
        'X-FB-ACCESS-SIGNATURE': signature,
        'Content-Type': 'application/json',
    }

    try:
        response = requests.request(method, url, params=params, json=body, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.HTTPError as http_err:
        print(f"HTTP Status Code: {http_err.response.status_code}, Error Response Body:", http_err.response.json())
        raise
    except Exception as err:
        print(f"An error occurred: {err}")
        raise

if __name__ == '__main__':
    try:
        print('FOXBIT_API_KEY:', api_key)

        # Get user info
        meResponse = request('GET', '/rest/v3/me', None, None)
        print('Response:', meResponse)

        # Create a new order
        order = {
            'market_symbol': 'btcbrl',
            'side': 'BUY',
            'type': 'LIMIT',
            'price': '10.0',
            'quantity': '0.0001',
        }
        orderResponse = request('POST', '/rest/v3/orders', None, order)
        print('Response:', orderResponse)

        time.sleep(2)

        # Get active orders
        ordersParams = {
            'market_symbol': 'btcbrl',
            'state': 'ACTIVE'
        }
        ordersResponse = request('GET', '/rest/v3/orders', ordersParams, None)
        print('Response:', ordersResponse)

        # Cancel the order
        orderToCancel = {
            'type': 'ID',
            'id': orderResponse['id']
        }
        cancelResponse = request('PUT', '/rest/v3/orders/cancel', None, orderToCancel)
        print('Response:', cancelResponse)

    except Exception as e:
        print('Failed to process request.', str(e))

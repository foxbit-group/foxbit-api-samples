import CryptoJS from 'crypto-js';
import axios, { AxiosResponse } from 'axios';

const apiBaseUrl = 'https://api.foxbit.com.br';

interface SignReturn {
  signature: string;
  timestamp: number;
}

function sign(method: string, path: string, params?: Record<string, any>, body?: Record<string, any>): SignReturn {
  let queryString = '';
  if (params) {
    queryString = Object.keys(params).map((key) => {
      return `${key}=${encodeURIComponent(params[key])}`;
    }).join('&');
  }

  let rawBody = '';
  if (body) {
    rawBody = JSON.stringify(body);
  }

  const timestamp = Date.now();
  const preHash = `${timestamp}${method}${path}${queryString}${rawBody}`;
  console.debug('PreHash:', preHash);
  const signature = CryptoJS.HmacSHA256(preHash, process.env.FOXBIT_API_SECRET!).toString();
  console.debug('Signature:', signature);

  return { signature, timestamp };
}

async function request(method: string, path: string, params?: Record<string, any>, body?: Record<string, any>): Promise<AxiosResponse> {
  console.debug('--------------------------------------------------');
  console.debug('Requesting:', method, path);
  const { signature, timestamp } = sign(method, path, params, body);
  const url = `${apiBaseUrl}${path}`;
  const headers = {
    'X-FB-ACCESS-KEY': process.env.FOXBIT_API_KEY!,
    'X-FB-ACCESS-TIMESTAMP': timestamp.toString(),
    'X-FB-ACCESS-SIGNATURE': signature,
    'Content-Type': 'application/json',
  };

  try {
    const config = {
      method,
      url,
      params,
      data: body,
      headers: headers,
    };
    const response = await axios(config);
    return response;
  } catch (error: any) {
    if (error.response) {
      console.error(`HTTP Status Code: ${error.response.status}, Error Response Body:`, error.response.data);
      throw error;
    } else {
      throw error;
    }
  }
}

(async () => {
  try {
    // Get the user information
    const meResponse = await request('GET', '/rest/v3/me');
    console.log('Response:', meResponse.data);

    // Request to create a new order
    const order = {
      market_symbol: 'btcbrl',
      side: 'BUY',
      type: 'LIMIT',
      price: '10.0',
      quantity: '0.0001',
    };
    const orderResponse = await request('POST', '/rest/v3/orders', undefined, order);
    console.log('Response:', orderResponse.data);

    // Get active orders
    const ordersParam = {
      market_symbol: 'btcbrl',
      state: 'ACTIVE',
    };
    const ordersResponse = await request('GET', '/rest/v3/orders', ordersParam);
    console.log('Response:', ordersResponse.data);

    // Request to get the order book
    const orderToCancel = {
      type: 'ID',
      id: orderResponse.data.id
    };
    const cancelResponse = await request('PUT', '/rest/v3/orders/cancel', undefined, orderToCancel);
    console.log('Response:', cancelResponse.data);
  } catch (error) {
    console.error('Failed to process request.');
  }
})();

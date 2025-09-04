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
      return `${key}=${params[key]}`;
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  try {
    console.log('FOXBIT_API_KEY:', process.env.FOXBIT_API_KEY);

    // Get the user information
    const meResponse = await request('GET', '/rest/v3/me');
    console.log('Response:', meResponse.data);

    // Get current price
    const marketSymbol = 'btcbrl';
    const tickerResponse = await request('GET', `/rest/v3/markets/${marketSymbol}/ticker/24hr`);
    const ticker = tickerResponse.data?.data?.[0];
    console.log('Response:', ticker);

    // Request to create a new order
    const lastPrice = Number(ticker.best.bid.price);
    const targetPrice = (lastPrice * 0.9).toString(); // Calculate target price: 10% below the best bid price
    const order = {
      market_symbol: marketSymbol,
      side: 'BUY',
      type: 'LIMIT',
      price: targetPrice,
      quantity: '0.0001',
    };
    const orderResponse = await request('POST', '/rest/v3/orders', undefined, order);
    console.log('Response:', orderResponse.data);

    await sleep(2000);

    // Get active orders
    const oneHourAgoISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const ordersParam = {
      market_symbol: marketSymbol,
      state: 'ACTIVE',
      start_time: oneHourAgoISO, // Optional: included to test signature behavior with special chars
    };
    const ordersResponse = await request('GET', '/rest/v3/orders', ordersParam);
    console.log('Response:', ordersResponse.data);

    // Request to cancel the order
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

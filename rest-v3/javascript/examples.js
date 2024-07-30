const CryptoJS = require('crypto-js');
const axios = require('axios');

const apiBaseUrl = 'https://api.foxbit.com.br';

function sign(method, path, params, body) {
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
  const signature = CryptoJS.HmacSHA256(preHash, process.env.FOXBIT_API_SECRET).toString();
  console.debug('Signature:', signature);

  return { signature, timestamp };
}

async function request(method, path, params, body) {
  console.debug('--------------------------------------------------');
  console.debug('Requesting:', method, path);
  const { signature, timestamp } = sign(method, path, params, body);
  const url = `${apiBaseUrl}${path}`;
  const headers = {
    'X-FB-ACCESS-KEY': process.env.FOXBIT_API_KEY,
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
  } catch (error) {
    if (error.response) {
      console.error(`HTTP Status Code: ${error.response.status}, Error Response Body:`, error.response.data);
      throw error;
    } else {
      throw error;
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  try {
    console.log('FOXBIT_API_KEY:', process.env.FOXBIT_API_KEY);

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
    const orderResponse = await request('POST', '/rest/v3/orders', null, order);
    console.log('Response:', orderResponse.data);

    await sleep(2000);

    // Get active orders
    const orderParams = {
      market_symbol: 'btcbrl',
      state: 'ACTIVE',
    };
    const activeOrdersResponse = await request('GET', '/rest/v3/orders', orderParams);
    console.log('Response:', activeOrdersResponse.data);

    // Request to cancel the order
    const orderToCancel = {
      type: 'ID',
      id: orderResponse.data.id
    };
    const cancelResponse = await request('PUT', '/rest/v3/orders/cancel', null, orderToCancel);
    console.log('Response:', cancelResponse.data);
  } catch (error) {
    console.error('Failed to process request.');
  }
})();

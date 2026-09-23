// Foxbit REST API v3 example — plain Node.js, zero dependencies.
// Uses the native fetch (Node >= 18) and node:crypto for HMAC-SHA256.
// Docs: https://docs.foxbit.com.br/rest/v3/

import { createHmac } from 'node:crypto';

const BASE_URL = 'https://api.foxbit.com.br';
const TIMEOUT_MS = 30_000;
// Limit price as a fraction of the best bid. The API rejects prices too far
// from the market (422, code 5005); the band width is not documented.
const PRICE_FACTOR = 0.5;

const API_KEY = process.env.FOXBIT_API_KEY;
const API_SECRET = process.env.FOXBIT_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('Missing credentials: set the FOXBIT_API_KEY and FOXBIT_API_SECRET environment variables.');
  process.exit(1);
}

// Percent-encode per RFC 3986: encodeURIComponent leaves ! ' ( ) * alone,
// so they are escaped explicitly. Space becomes %20, never +.
function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// Build both representations of the query string from the SAME ordered params:
//   - decoded: raw values, used in the signature prehash
//   - encoded: RFC 3986 percent-encoded values, used in the URL
// Deriving both from one structure makes it impossible for them to diverge.
function buildQueryStrings(params) {
  const entries = Object.entries(params ?? {});
  const decoded = entries.map(([key, value]) => `${key}=${value}`).join('&');
  const encoded = entries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
  return { decoded, encoded };
}

// HMAC-SHA256 (hex) over: timestamp + method + path + decodedQueryString + rawBody
// Gotcha #1: the query string enters the prehash with DECODED (raw) values,
// even though the URL sends them percent-encoded.
// Gotcha #2: rawBody must be byte-for-byte the string sent on the wire —
// serialize the body exactly once and sign that same string.
function sign(method, path, decodedQueryString, rawBody, timestamp) {
  const preHash = `${timestamp}${method}${path}${decodedQueryString}${rawBody}`;
  console.log(`PreHash: ${preHash}`);
  return createHmac('sha256', API_SECRET).update(preHash).digest('hex');
}

// Minimal request helper. `auth: false` skips the signature headers
// (some endpoints, like the order book, are public).
async function request(method, path, { params, body, auth = true } = {}) {
  const { decoded, encoded } = buildQueryStrings(params);
  const url = `${BASE_URL}${path}${encoded ? `?${encoded}` : ''}`;
  // Serialized exactly once: the signed string and the sent bytes are the same.
  const rawBody = body ? JSON.stringify(body) : '';

  console.log('--------------------------------------------------');
  console.log(`${method} ${path}${encoded ? `?${encoded}` : ''}`);

  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const timestamp = Date.now().toString(); // milliseconds, same value as the header
    headers['X-FB-ACCESS-KEY'] = API_KEY;
    headers['X-FB-ACCESS-TIMESTAMP'] = timestamp;
    headers['X-FB-ACCESS-SIGNATURE'] = sign(method, path, decoded, rawBody, timestamp);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: rawBody || undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  console.log(`Response (${response.status}): ${text}`);

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // 1. Authenticated request without params: current user info.
  await request('GET', '/rest/v3/me');

  // 2. Public endpoint (no signature needed): top of the btcbrl order book.
  const orderbook = await request('GET', '/rest/v3/markets/btcbrl/orderbook', {
    params: { depth: '1' },
    auth: false,
  });
  const bestBid = Number(orderbook.bids[0][0]);

  // 3. Price the order at 50% of the best bid, formatted as an integer
  // (btcbrl has price_increment 1.0). 50% stays inside the exchange price
  // band — absurd values like a hardcoded 10.0 are rejected with 422 —
  // while remaining far too low to ever execute.
  const price = String(Math.floor(bestBid * PRICE_FACTOR));

  // 4. Create a LIMIT BUY order and capture its id.
  const order = await request('POST', '/rest/v3/orders', {
    body: {
      market_symbol: 'btcbrl',
      side: 'BUY',
      type: 'LIMIT',
      price,
      quantity: '0.0001',
    },
  });

  // 5. Give the matching engine a moment to register the order.
  await sleep(2000);

  // 6. List active orders — the order created above should appear.
  await request('GET', '/rest/v3/orders', {
    params: { market_symbol: 'btcbrl', state: 'ACTIVE' },
  });

  // 7. Cancel the order by its id.
  await request('PUT', '/rest/v3/orders/cancel', {
    body: { type: 'ID', id: order.id },
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

import { createHmac } from 'node:crypto';

// Foxbit REST API v3 base URL.
const API_URL = 'https://api.foxbit.com.br';
const TIMEOUT_MS = 30_000;
// Limit price as a fraction of the best bid. The API rejects prices too far
// from the market (422, code 5005); the band width is not documented.
const PRICE_FACTOR = 0.5;

// Credentials come from the environment. Fail fast (before any request) with a
// clear message if they are missing. The key and secret are never printed.
const API_KEY = requireEnv('FOXBIT_API_KEY');
const API_SECRET = requireEnv('FOXBIT_API_SECRET');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// Percent-encode a value following RFC 3986: unreserved characters
// (A-Z a-z 0-9 - _ . ~) stay as-is, everything else is percent-encoded and a
// space becomes %20 (never +). encodeURIComponent already does this except for
// ! ' ( ) *, which we encode explicitly to be strict.
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// Build a query string from ordered params. The URL uses percent-encoded values;
// the prehash uses the raw (decoded) values. Both are built from the same object,
// so their key order can never diverge.
function toQueryString(params: Record<string, string>, encode: boolean): string {
  return Object.entries(params)
    .map(([key, value]) =>
      encode ? `${encodeRfc3986(key)}=${encodeRfc3986(value)}` : `${key}=${value}`,
    )
    .join('&');
}

// HMAC-SHA256 (hex) over: timestamp + method + path + decodedQuery + rawBody.
//
// Two signing gotchas, both validated against the live API:
//   1. The query string is signed DECODED (raw values), but sent percent-encoded
//      in the URL. Signing the encoded form is rejected.
//   2. The body is signed exactly as the bytes sent on the wire, so it must be
//      serialized only once and both signed and sent as the same string.
function sign(
  method: string,
  path: string,
  decodedQuery: string,
  rawBody: string,
  timestamp: string,
): string {
  const preHash = `${timestamp}${method}${path}${decodedQuery}${rawBody}`;
  console.log('PreHash:', preHash);
  const signature = createHmac('sha256', API_SECRET).update(preHash).digest('hex');
  return signature;
}

interface RequestOptions {
  params?: Record<string, string>;
  body?: unknown;
  auth?: boolean;
}

async function request(
  method: string,
  path: string,
  { params = {}, body, auth = true }: RequestOptions = {},
): Promise<any> {
  const decodedQuery = toQueryString(params, false);
  const encodedQuery = toQueryString(params, true);
  // Serialize the body a single time; the same string is signed and sent.
  const rawBody = body === undefined ? '' : JSON.stringify(body);

  const url = `${API_URL}${path}${encodedQuery ? `?${encodedQuery}` : ''}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  console.log('--------------------------------------------------');
  console.log(`${method} ${path}`);

  if (auth) {
    // UNIX timestamp in milliseconds; the same value is signed and sent.
    const timestamp = Date.now().toString();
    headers['X-FB-ACCESS-KEY'] = API_KEY;
    headers['X-FB-ACCESS-TIMESTAMP'] = timestamp;
    headers['X-FB-ACCESS-SIGNATURE'] = sign(method, path, decodedQuery, rawBody, timestamp);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: rawBody === '' ? undefined : rawBody,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();
  console.log(`Response (${response.status}): ${text}`);

  // Any 2xx is a success (POST /orders answers 201).
  if (!response.ok) {
    throw new Error(`Request failed: ${method} ${path} -> HTTP ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const marketSymbol = 'btcbrl';

  // 1. Authenticated request with no params: fetch the account profile.
  await request('GET', '/rest/v3/me');

  // 2. Public request (no authentication): read the top of the order book.
  const orderbook = await request('GET', `/rest/v3/markets/${marketSymbol}/orderbook`, {
    params: { depth: '1' },
    auth: false,
  });

  // 3. Price = floor(bestBid * PRICE_FACTOR); btcbrl has price_increment 1.0,
  //    so it must be a whole number. See PRICE_FACTOR above for the 422 caveat.
  const bestBid = Number(orderbook.bids[0][0]);
  const price = Math.floor(bestBid * PRICE_FACTOR).toString();

  // 4. Create a real LIMIT BUY order and capture its id.
  const created = await request('POST', '/rest/v3/orders', {
    body: {
      market_symbol: marketSymbol,
      side: 'BUY',
      type: 'LIMIT',
      price,
      quantity: '0.0001',
    },
  });
  const orderId: string = created.id;

  // 5. Give the engine a moment to register the order.
  await sleep(2000);

  // 6. List active orders; the order created above should appear.
  await request('GET', '/rest/v3/orders', {
    params: { market_symbol: marketSymbol, state: 'ACTIVE' },
  });

  // 7. Cancel the order by id.
  await request('PUT', '/rest/v3/orders/cancel', {
    body: { type: 'ID', id: orderId },
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

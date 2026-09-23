# Foxbit REST API v3 — JavaScript Example

A minimal, dependency-free Node.js example of the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/). It runs a complete flow in 7 steps:

1. `GET /rest/v3/me` — authenticated request with no parameters.
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — public request (no signature) to fetch the best bid.
3. Compute a limit price at 50% of the best bid, rounded to an integer.
4. `POST /rest/v3/orders` — create a LIMIT BUY order for 0.0001 BTC.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders.
7. `PUT /rest/v3/orders/cancel` — cancel the order created in step 4.

> **Warning:** this example creates a REAL order on your account (LIMIT BUY 0.0001 BTC at 50% of the market price — inside the exchange price band, but far too low to ever execute) and cancels it right after.

## Requirements

- Docker (recommended), or
- Node.js >= 18 (native `fetch`) to run natively. No npm packages are needed.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Alternatively, put both variables in a `.env` file and use `--env-file .env` with Docker.

## Run with Docker

```bash
docker build -t foxbit-sample-javascript .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-javascript
# or: docker run --rm --env-file .env foxbit-sample-javascript
```

## Run natively

```bash
node examples.js
# or: npm start
```

## How request signing works

Every authenticated request sends three headers: `X-FB-ACCESS-KEY`, `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and `X-FB-ACCESS-SIGNATURE`. The signature is an HMAC-SHA256 (hex) of:

```
timestamp + method + path + queryString + rawBody
```

Two gotchas that cause most `401` errors:

1. **The query string enters the prehash DECODED** (raw values, e.g. `market_symbol=btc brl`), while the URL itself sends the values percent-encoded per RFC 3986 (`market_symbol=btc%20brl`). Build both from the same ordered structure.
2. **The body is verified byte-for-byte as sent.** Serialize the JSON body exactly once, sign that string and send that same string — never let the HTTP client re-serialize it.

See the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

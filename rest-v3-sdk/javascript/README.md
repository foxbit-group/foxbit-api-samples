# Foxbit REST API v3 — JavaScript SDK Example

[![npm version](https://img.shields.io/npm/v/@foxbit-group/rest-api.svg?style=flat)](https://www.npmjs.com/package/@foxbit-group/rest-api)

A minimal Node.js example of the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/) built on the official SDK, [`@foxbit-group/rest-api`](https://www.npmjs.com/package/@foxbit-group/rest-api). It runs a complete flow in 7 steps:

1. `GET /rest/v3/me` — authenticated request with no parameters.
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — public market data to read the best bid.
3. Compute a limit price at 50% of the best bid, floored to an integer (`btcbrl` uses `price_increment: 1.0`).
4. `POST /rest/v3/orders` — create a LIMIT BUY for 0.0001 BTC at the computed price.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders.
7. `PUT /rest/v3/orders/cancel` — cancel the order created in step 4.

> **Warning:** this example creates a REAL order on your account (LIMIT BUY 0.0001 BTC at 50% of the market price — inside the exchange price band, but far too low to ever execute) and cancels it right after.

## Requirements

- Docker (recommended), or
- Node.js >= 18 to run natively.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Alternatively, put both variables in a `.env` file and use `--env-file .env` with Docker.

## Run with Docker

```bash
docker build -t foxbit-sample-sdk-javascript .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-sdk-javascript
# or: docker run --rm --env-file .env foxbit-sample-sdk-javascript
```

## Run natively

```bash
npm install
npm start
# or: node examples.js
```

## How request signing works

Every authenticated request must be signed with HMAC-SHA256 and carry the headers `X-FB-ACCESS-KEY`, `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and `X-FB-ACCESS-SIGNATURE`.

**The official SDK handles all of this for you.** When you build a `Configuration` with your `apiKey`/`apiSecret`, the SDK computes the prehash (`timestamp + method + path + queryString + rawBody`), signs it and attaches the headers on every call — so this example contains no manual signing code. If you need to implement signing yourself, see the dependency-free examples under [`rest-v3/`](../../rest-v3) and the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

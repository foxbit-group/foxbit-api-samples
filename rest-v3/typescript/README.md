# Foxbit REST API v3 — TypeScript Example

A minimal, self-contained example of authenticating and trading with the
[Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/) in TypeScript. It uses
only the Node.js standard library at runtime (`fetch` + `node:crypto`); the sole
build-time dependencies are `typescript` and `@types/node`.

## What it does

The example runs the following flow end to end:

1. `GET /rest/v3/me` — authenticated, fetches the account profile.
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — public (no authentication),
   reads the best bid.
3. Computes a price of `floor(bestBid * 0.5)` as an integer (btcbrl uses a price
   increment of `1.0`). Half the market price stays inside the API price band but
   is far too low to ever execute.
4. `POST /rest/v3/orders` — authenticated, creates a **real** LIMIT BUY order for
   `0.0001 BTC` and captures its id.
5. Waits 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — authenticated, lists
   the active order.
7. `PUT /rest/v3/orders/cancel` — authenticated, cancels the order by id.

> **Warning:** step 4 places a real order on your account. It is priced far from
> the market so it will not execute, and step 7 cancels it immediately.

## Requirements

- [Docker](https://www.docker.com/) (recommended), or
- Node.js `>= 18` with TypeScript to run natively.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and expose it
through the environment:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Alternatively, put both values in a `.env` file and pass it with `--env-file`.

## Run with Docker

```bash
docker build -t foxbit-sample-typescript .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-typescript
```

Or, using a `.env` file:

```bash
docker run --rm --env-file .env foxbit-sample-typescript
```

## Run natively

```bash
npm install
npm run build
npm start
```

## How request signing works

Every authenticated request is signed with HMAC-SHA256 (hex) over the string:

```
timestamp + method + path + queryString + rawBody
```

- `timestamp` is the UNIX time in milliseconds; the same value is sent in the
  `X-FB-ACCESS-TIMESTAMP` header.
- The signature goes in `X-FB-ACCESS-SIGNATURE` and the API key in
  `X-FB-ACCESS-KEY`.

Two details are easy to get wrong:

1. **The query string is signed decoded, but sent percent-encoded.** The prehash
   uses raw values (`market_symbol=btc brl`) while the URL uses RFC 3986 encoding
   (`market_symbol=btc%20brl`). Building both from the same ordered structure
   keeps the key order identical.
2. **The body is signed exactly as the bytes sent.** Serialize the JSON once and
   sign and send that same string — re-serializing for the request would break
   the signature.

See the [Foxbit API documentation](https://docs.foxbit.com.br/rest/v3/) for
details.

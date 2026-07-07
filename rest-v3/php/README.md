# Foxbit REST API v3 — PHP Example

A single-file example ([examples.php](examples.php)) that shows how to call the
[Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/) from PHP, using only
built-ins (ext-curl, `hash_hmac()`, `json_encode()`) — no Composer dependencies.

It runs the following flow:

1. `GET /rest/v3/me` — account information (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — order book (public, no auth).
3. Compute the order price: 50% of the best bid, rounded down to an integer.
4. `POST /rest/v3/orders` — place a limit buy order.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders.
7. `PUT /rest/v3/orders/cancel` — cancel the order created in step 4.

> **Warning:** the example places a REAL order on your account — a LIMIT BUY of
> 0.0001 BTC priced at 50% of the market, which stays inside the accepted price
> band but far from execution — and cancels it right after.

## Requirements

- [Docker](https://www.docker.com/) (recommended), or
- PHP >= 8.1 with ext-curl (optional, to run natively).

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Alternatively, put both variables in a `.env` file and pass it to Docker with
`--env-file .env`.

## Run with Docker

```bash
docker build -t foxbit-sample-php .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-php
```

Or, using a `.env` file:

```bash
docker run --rm --env-file .env foxbit-sample-php
```

## Run natively

```bash
php examples.php
```

## How request signing works

Every authenticated request sends three headers: `X-FB-ACCESS-KEY` (your API
key), `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and
`X-FB-ACCESS-SIGNATURE`. The signature is a lowercase hex HMAC-SHA256 of:

```
timestamp + method + path + queryString + rawBody
```

Two details are easy to get wrong:

1. **The query string goes into the pre-hash DECODED** (raw values, e.g.
   `market_symbol=btc brl`), while the URL itself uses the RFC 3986
   percent-encoded form (`market_symbol=btc%20brl`). Signing the encoded form
   results in HTTP 401. Both strings must list the parameters in the same
   order, so the example builds them from the same array.
2. **The body is verified against the exact bytes sent.** Serialize the JSON
   body once, sign that string and send that same string. Serializing twice
   (e.g. once for the signature and again in the HTTP client) can produce
   different bytes and an invalid signature.

See the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

# Foxbit REST API v3 — Swift Example

A minimal, self-contained example of how to call the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/) from Swift, including request signing.

It runs the following flow:

1. `GET /rest/v3/me` — fetch account info (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — read the order book (public, no auth).
3. Compute a limit price at 50% of the best bid.
4. `POST /rest/v3/orders` — create a LIMIT BUY order for 0.0001 BTC.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders.
7. `PUT /rest/v3/orders/cancel` — cancel the order created in step 4.

> **Warning**: this example places a REAL order on your account — a LIMIT BUY of 0.0001 BTC at 50% of the current market price. That price is inside the accepted price band but far from ever executing, and the order is cancelled at the end of the flow.

## Requirements

- Docker (recommended), or
- Swift 6.1+ toolchain (native run, optional)

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Or put both variables in a `.env` file and pass it to Docker with `--env-file .env`.

## Run with Docker

```bash
docker build -t foxbit-sample-swift .

docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-swift
# or: docker run --rm --env-file .env foxbit-sample-swift
```

## Run natively

```bash
swift run
```

## How request signing works

Every authenticated request sends three headers: `X-FB-ACCESS-KEY` (your API key), `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and `X-FB-ACCESS-SIGNATURE`. The signature is an HMAC-SHA256 (hex) of:

```
timestamp + method + path + queryString + rawBody
```

Two gotchas that cause most `401 Unauthorized` errors:

1. **The query string goes into the pre-hash DECODED** (raw values, e.g. `market_symbol=btc brl`), while the URL itself carries it percent-encoded (RFC 3986, e.g. `market_symbol=btc%20brl`). Build both strings from the same ordered parameter list.
2. **The body is verified byte-for-byte as sent.** Serialize the JSON body exactly once and sign that same string — never re-serialize it when sending.

See the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

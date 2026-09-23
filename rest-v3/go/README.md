# Foxbit REST API v3 — Go Example

A single-file, standard-library-only Go program that demonstrates how to sign
and send requests to the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/).

It runs the following flow:

1. `GET /rest/v3/me` — fetch account information (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — fetch the order book (public, unauthenticated).
3. Compute an order price at 50% of the best bid.
4. `POST /rest/v3/orders` — create a LIMIT BUY order for 0.0001 BTC (authenticated).
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders (authenticated).
7. `PUT /rest/v3/orders/cancel` — cancel the order created in step 4 (authenticated).

> **Warning:** this example creates a REAL order on your account — a LIMIT BUY
> of 0.0001 BTC priced at 50% of the current market. That price is inside the
> accepted price band but far too low to ever execute, and the order is
> cancelled at the end of the flow.

## Requirements

- Docker (recommended), or
- Go 1.26+ if you want to run it natively.

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
docker build -t foxbit-sample-go .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-go
# or: docker run --rm --env-file .env foxbit-sample-go
```

## Run natively

```bash
go run .
```

## How request signing works

Every authenticated request carries three headers: `X-FB-ACCESS-KEY` (your API
key), `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and
`X-FB-ACCESS-SIGNATURE`. The signature is a lowercase-hex HMAC-SHA256 of the
prehash string, keyed with your API secret:

```
preHash = timestamp + METHOD + path + queryString + rawBody
```

Two gotchas that cause most `401` errors:

1. **The query string goes into the prehash DECODED.** Sign the raw values
   (`market_symbol=btc brl`) in the same pair order as the URL, but send them
   percent-encoded per RFC 3986 (`market_symbol=btc%20brl`, space is `%20`,
   never `+`).
2. **The body is verified byte-for-byte.** Serialize the JSON body exactly
   once and use that same string both in the prehash and as the request body.
   Re-serializing (or letting the HTTP client re-encode it) can change the
   bytes and invalidate the signature.

See the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

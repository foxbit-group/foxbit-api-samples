# Foxbit REST API v3 — Ruby Example

A minimal, dependency-free example (Ruby standard library only) of how to authenticate and trade with the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/).

The script runs the following flow:

1. `GET /rest/v3/me` — fetch account information (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — fetch the order book (public, no authentication).
3. Compute an order price at 50% of the best bid.
4. `POST /rest/v3/orders` — create a LIMIT BUY order (0.0001 BTC).
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders.
7. `PUT /rest/v3/orders/cancel` — cancel the created order.

> **Warning:** this example creates a REAL order on your account — a LIMIT BUY of 0.0001 BTC priced at 50% of the current market. That price is inside the accepted price band but far too low to ever execute, and the order is cancelled at the end of the flow.

## Requirements

- [Docker](https://www.docker.com/) (recommended), or
- Ruby >= 3.2 (uses `CGI.escapeURIComponent`) to run natively.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Alternatively, put both variables in a `.env` file and pass it to Docker with `--env-file .env`.

## Run with Docker

```bash
docker build -t foxbit-sample-ruby .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-ruby
```

Or, using a `.env` file:

```bash
docker run --rm --env-file .env foxbit-sample-ruby
```

## Run natively

```bash
ruby examples.rb
```

## How request signing works

Every authenticated request is signed with HMAC-SHA256 (hex, lowercase) using your API secret over the string:

```
preHash = timestamp + method + path + queryString + rawBody
```

- `timestamp`: UNIX time in **milliseconds** — the same value sent in the `X-FB-ACCESS-TIMESTAMP` header.
- `method`: uppercase HTTP verb (`GET`, `POST`, ...).
- `path`: e.g. `/rest/v3/orders` (no host, no query string).
- `queryString`: `key=value&key2=value2`, empty if there are no params.
- `rawBody`: the JSON request body as sent, empty if there is no body.

The signature goes in the `X-FB-ACCESS-SIGNATURE` header, alongside `X-FB-ACCESS-KEY` (your API key) and `X-FB-ACCESS-TIMESTAMP`.

Two gotchas that cause most `401` errors:

1. **The query string enters the prehash with decoded (raw) values**, while the URL itself uses RFC 3986 percent-encoding (space = `%20`). Sign `market_symbol=btc brl`, send `market_symbol=btc%20brl`. Both must use the same parameter order.
2. **The body is verified against the exact bytes sent.** Serialize the JSON body once, sign that string and send that same string — never re-serialize.

See the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

# Foxbit REST API v3 — Dart Example

A minimal, self-contained example of integrating with the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/) in Dart. It runs the following flow:

1. `GET /rest/v3/me` — fetch account info (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — fetch the order book (public, no authentication).
3. Compute a safe limit price: 50% of the best bid, rounded down to an integer (`btcbrl` has a price increment of `1.0`).
4. `POST /rest/v3/orders` — place a limit buy order.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders.
7. `PUT /rest/v3/orders/cancel` — cancel the order created in step 4.

> **Warning**: this example creates a REAL order (LIMIT BUY of 0.0001 BTC at 50% of the market price — inside the accepted price band, but far too low to ever execute) and cancels it right after.

## Requirements

- Docker (recommended), or
- Dart SDK >= 3.5 to run natively.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY=your_api_key
export FOXBIT_API_SECRET=your_api_secret
```

Alternatively, put both variables in a `.env` file and pass `--env-file .env` to `docker run`.

## Run with Docker

```bash
docker build -t foxbit-sample-dart .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-dart
```

Or, with a `.env` file:

```bash
docker run --rm --env-file .env foxbit-sample-dart
```

## Run natively

```bash
dart pub get
dart run bin/main.dart
```

## How request signing works

Every authenticated request carries three headers: `X-FB-ACCESS-KEY` (your API key), `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and `X-FB-ACCESS-SIGNATURE`. The signature is an HMAC-SHA256 (lowercase hex) of:

```
timestamp + HTTP method + path + query string + raw body
```

Two gotchas that cause most `401 Unauthorized` errors:

1. **The query string goes DECODED into the pre-hash but percent-encoded (RFC 3986) into the URL.** Sign `market_symbol=btc brl`, send `market_symbol=btc%20brl`. Build both strings from the same ordered parameter list so the pairs and their order always match.
2. **The body is signed exactly as the bytes sent on the wire.** Serialize the JSON once and use that same string for both the signature and the request body — serializing twice risks a formatting mismatch.

Full documentation: <https://docs.foxbit.com.br/rest/v3/>

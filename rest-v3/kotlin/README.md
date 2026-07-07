# Foxbit REST API v3 — Kotlin Example

A minimal, didactic example of integrating with the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/) in Kotlin, using only `java.net.http.HttpClient`, `javax.crypto` and a small JSON library (`org.json`).

It runs the following flow:

1. `GET /rest/v3/me` — fetch account information (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — fetch the best bid (public endpoint, no authentication).
3. Compute a limit price at 50% of the best bid, rounded down to an integer.
4. `POST /rest/v3/orders` — create a LIMIT BUY order for 0.0001 BTC.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders (the new order shows up).
7. `PUT /rest/v3/orders/cancel` — cancel the order by id.

> **Warning:** this example creates a REAL order on your account (LIMIT BUY of 0.0001 BTC at 50% of the market price — inside the accepted price band but far too low to ever execute) and cancels it right after.

## Requirements

- Docker (recommended), or
- JDK 21+ and Gradle 8.14+ to run natively.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your_api_key"
export FOXBIT_API_SECRET="your_api_secret"
```

Alternatively, put both variables in a `.env` file and pass it to Docker with `--env-file .env`.

## Run with Docker

```bash
docker build -t foxbit-sample-kotlin .

docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-kotlin
# or: docker run --rm --env-file .env foxbit-sample-kotlin
```

## Run natively

```bash
gradle run
```

## How request signing works

Every authenticated request carries three headers: `X-FB-ACCESS-KEY` (the API key), `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and `X-FB-ACCESS-SIGNATURE`. The signature is the lowercase hex HMAC-SHA256 of:

```
timestamp + method + path + queryString + rawBody
```

Two gotchas trip most integrations:

1. **The query string is signed DECODED, but sent percent-encoded.** The pre-hash uses raw values (`market_symbol=btc brl`), while the URL must carry them RFC 3986 percent-encoded (`market_symbol=btc%20brl`, space is `%20`, never `+`). Build both forms from the same ordered parameter list so they cannot diverge.
2. **The body is signed exactly as the bytes sent.** Serialize the JSON body once and use that same string for both the signature and the request payload — signing one formatting and sending another yields a 401.

See the [official documentation](https://docs.foxbit.com.br/rest/v3/) for details.

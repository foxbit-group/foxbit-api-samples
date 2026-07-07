# Foxbit REST API v3 — C# (.NET) Example

A minimal, dependency-free C# example of the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/), using only the .NET base class library (`HttpClient`, `System.Text.Json`, `HMACSHA256`).

It runs the following flow:

1. `GET /rest/v3/me` — check your credentials (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — fetch the best bid (public, no authentication).
3. Compute a limit price at 50% of the best bid, rounded down to a whole number.
4. `POST /rest/v3/orders` — place a LIMIT BUY order for 0.0001 BTC at that price.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders (the new order shows up).
7. `PUT /rest/v3/orders/cancel` — cancel the order by its id.

> **Warning:** this example places a REAL order on your account — a LIMIT BUY of 0.0001 BTC at 50% of the current market price. That price is inside the exchange's accepted price band but far too low to ever execute, and the order is cancelled at the end of the flow.

## Requirements

- Docker (recommended), or
- .NET SDK 10.0+ to run natively.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Alternatively, put both variables in a `.env` file and pass it to Docker with `--env-file .env`.

## Run with Docker

```bash
docker build -t foxbit-sample-dotnet .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-dotnet
```

Or, using a `.env` file:

```bash
docker run --rm --env-file .env foxbit-sample-dotnet
```

## Run natively

```bash
dotnet run
```

## How request signing works

Every authenticated request carries three headers: `X-FB-ACCESS-KEY` (your API key), `X-FB-ACCESS-TIMESTAMP` (Unix time in milliseconds) and `X-FB-ACCESS-SIGNATURE`. The signature is an HMAC-SHA256 (lowercase hex) of:

```
timestamp + method + path + queryString + rawBody
```

Two details are easy to get wrong:

1. **The query string goes into the pre-hash DECODED.** Sign the raw values (`market_symbol=btc brl`), but send them percent-encoded per RFC 3986 in the URL (`market_symbol=btc%20brl`, space as `%20`, never `+`). Signing the encoded form yields a 401.
2. **The body is signed exactly as sent.** Serialize the JSON body once and use that same string for both the signature and the request content. Serializing twice (or letting the HTTP client re-serialize) can change the bytes and yields a 401.

See the full API documentation at <https://docs.foxbit.com.br/rest/v3/>.

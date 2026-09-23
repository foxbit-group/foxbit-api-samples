# Foxbit REST API v3 — Java Example

A minimal, self-contained Java example of how to authenticate and trade with the
[Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/). It performs the following flow:

1. `GET /rest/v3/me` — fetch account information (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — fetch the top of the order book (public endpoint, no authentication).
3. Compute a limit price at 50% of the best bid, floored to an integer (the `btcbrl` market has `price_increment: 1.0`).
4. `POST /rest/v3/orders` — create a LIMIT BUY order of 0.0001 BTC at that price.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders (the new order shows up).
7. `PUT /rest/v3/orders/cancel` — cancel the order by id.

> **Warning:** this example creates a REAL order on your account — a LIMIT BUY of
> 0.0001 BTC at 50% of the current market price. That price is inside the band accepted
> by the API but far too low to ever execute, and the order is cancelled at the end of
> the flow.

## Requirements

- [Docker](https://www.docker.com/) (recommended — no local toolchain needed), **or**
- Java 21+ and Maven 3.9+ to run natively.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Alternatively, put both variables in a `.env` file and pass it to Docker with `--env-file .env`.

## Run with Docker

```bash
docker build -t foxbit-sample-java .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-java
```

Or, using a `.env` file:

```bash
docker run --rm --env-file .env foxbit-sample-java
```

## Run natively

```bash
mvn package
java -jar target/foxbit-sample.jar
```

## How request signing works

Every authenticated request carries three headers: `X-FB-ACCESS-KEY` (your API key),
`X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and `X-FB-ACCESS-SIGNATURE`.
The signature is an HMAC-SHA256 (lowercase hex) of the string:

```
timestamp + method + path + queryString + rawBody
```

Two gotchas cause most 401 errors:

1. **The query string goes into the prehash DECODED** (raw values, e.g. `q=btc brl`),
   while the URL itself must carry it percent-encoded per RFC 3986 (`q=btc%20brl`,
   space is `%20`, never `+`). Both forms must list the parameters in the same order.
2. **The body is verified against the exact bytes sent on the wire.** Serialize the
   JSON body once and use that same string both to sign and to send — signing one
   formatting and sending another (e.g. re-serialization by an HTTP library) breaks
   the signature.

See the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

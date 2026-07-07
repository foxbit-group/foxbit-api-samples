# Foxbit REST API v3 — C++ Example

A minimal, self-contained example of how to sign and send requests to the
[Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/). Running it executes
a full order lifecycle:

1. `GET /rest/v3/me` — fetch account information (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — read the public orderbook (no authentication).
3. Compute a safe order price: 50% of the best bid, rounded down to a whole number.
4. `POST /rest/v3/orders` — place a LIMIT BUY order for 0.0001 BTC.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders.
7. `PUT /rest/v3/orders/cancel` — cancel the order created in step 4.

> **Warning:** step 4 creates a REAL order on your account — a LIMIT BUY of
> 0.0001 BTC at 50% of the current market price. That price is inside the
> accepted price band but far too low to ever execute, and the order is
> canceled at the end of the flow.

The example uses libcurl for HTTP, OpenSSL for HMAC-SHA256 and the
[nlohmann/json](https://github.com/nlohmann/json) single header (pinned in the
Dockerfile) for JSON.

## Requirements

- [Docker](https://www.docker.com/) (recommended), or
- a C++17 compiler with libcurl and OpenSSL 3 development headers if you
  prefer to build natively.

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
docker build -t foxbit-sample-cpp .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-cpp
```

Or, using a `.env` file:

```bash
docker run --rm --env-file .env foxbit-sample-cpp
```

## Run natively

With g++, libcurl and OpenSSL development packages installed (e.g. on Debian:
`g++ libcurl4-openssl-dev libssl-dev`):

```bash
curl -fsSLo json.hpp https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp
g++ -std=c++17 -O2 -Wall -Wextra -o foxbit-example main.cpp -lcurl -lssl -lcrypto
./foxbit-example
```

## How request signing works

Every authenticated request carries three headers: `X-FB-ACCESS-KEY` (your API
key), `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and
`X-FB-ACCESS-SIGNATURE`. The signature is an HMAC-SHA256 (hex) of:

```
prehash = timestamp + HTTP method + path + query string + raw body
```

Two gotchas that cause most `401` errors:

1. **The query string goes into the prehash DECODED** (raw values, no
   percent-encoding), while the URL itself carries the RFC 3986
   percent-encoded form. Build both from the same ordered parameters.
2. **The body is verified byte for byte as sent.** Serialize the JSON body
   exactly once, then sign and send that same string (here, a single
   `dump()` whose result feeds both the signature and `CURLOPT_POSTFIELDS`).

See the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

# Foxbit REST API v3 — Python SDK Example

[![PyPI version](https://img.shields.io/pypi/v/foxbit-group-rest-api.svg?style=flat)](https://pypi.org/project/foxbit-group-rest-api/)

A minimal Python example of the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/) built on the official SDK, [`foxbit-group-rest-api`](https://pypi.org/project/foxbit-group-rest-api/). It runs a complete flow in 7 steps:

1. `GET /rest/v3/me` — authenticated request with no parameters.
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — public market data to read the best bid.
3. Compute a limit price at 50% of the best bid, floored to an integer (`btcbrl` uses `price_increment: 1.0`).
4. `POST /rest/v3/orders` — create a LIMIT BUY for 0.0001 BTC at the computed price.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — list active orders.
7. `PUT /rest/v3/orders/cancel` — cancel the order created in step 4.

> **Warning:** this example creates a REAL order on your account (LIMIT BUY 0.0001 BTC at 50% of the market price — inside the exchange price band, but far too low to ever execute) and cancels it right after.

## Requirements

- Docker (recommended), or
- Python 3.10+ to run natively.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and export it:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Alternatively, put both variables in a `.env` file and use `--env-file .env` with Docker.

## Run with Docker

```bash
docker build -t foxbit-sample-sdk-python .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-sdk-python
# or: docker run --rm --env-file .env foxbit-sample-sdk-python
```

## Run natively

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python example.py
```

## How request signing works

Every authenticated request must be signed and carry the headers `X-FB-ACCESS-KEY`, `X-FB-ACCESS-TIMESTAMP` (UNIX time in milliseconds) and `X-FB-ACCESS-SIGNATURE`. The optional `X-FB-RECEIVE-WINDOW` header limits how far the timestamp may drift from the server clock; the SDK sends it by default (10000 ms).

**The official SDK handles all of this for you.** When you build a `Configuration` with your `api_key`/`api_secret`, the SDK computes the prehash (`timestamp + method + path + queryString + rawBody`), signs it with HMAC-SHA256 and attaches the headers on every call, so this example contains no manual signing code. The SDK also supports Ed25519 keys: pass `private_key` instead of `api_secret`, as described in the [SDK documentation](https://pypi.org/project/foxbit-group-rest-api/).

API errors raise typed exceptions (`UnauthorizedException`, `TooManyRequestsException`, etc.), all subclasses of `ApiException`. This example prints only the HTTP status and the response body, never the request headers.

If you need to implement signing yourself, see the dependency-free examples under [`rest-v3/`](../../rest-v3) and the full documentation at <https://docs.foxbit.com.br/rest/v3/>.

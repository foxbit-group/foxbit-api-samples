# Foxbit REST API v3 — Python Example (Official SDK)

[![PyPI version](https://img.shields.io/pypi/v/foxbit-group-rest-api.svg?style=flat)](https://pypi.org/project/foxbit-group-rest-api/)

This example integrates with the Foxbit REST API v3 using the official
[`foxbit-group-rest-api`](https://pypi.org/project/foxbit-group-rest-api/)
SDK. The SDK handles request signing for you, so this example focuses on a
clean, end-to-end trading flow.

## What it does

The program (`example.py`) runs the following flow and exits non-zero on any error:

1. `GET /rest/v3/me` — authenticated: fetch the account tied to the API key.
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — public: read the best bid.
3. Compute a limit price at 50% of the best bid, floored to an integer
   (`btcbrl` uses `price_increment: 1.0`).
4. `POST /rest/v3/orders` — authenticated: place the order.
5. Wait 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — authenticated:
   the new order should be listed.
7. `PUT /rest/v3/orders/cancel` — authenticated: cancel the order by id.

> **Heads up:** step 4 places a **real** order (LIMIT BUY of `0.0001` BTC at
> 50% of the current market price). Pricing off the live market avoids the
> HTTP 422 "Price out of range" a hardcoded value such as `10.0` gets, while
> staying far enough below market that the order is not expected to execute.
> Step 7 cancels it, even if step 5 or 6 fails.
>
> The exchange price band is not documented: if the API rejects the price
> (HTTP 422), raise `PRICE_FACTOR`. A sharp market drop before step 7 could
> still fill the order.

## Requirements

- **Docker** (recommended) — no local toolchain needed.
- Optional native run: **Python >= 3.10**.

## Credentials

Create an API key at <https://app.foxbit.com.br/profile/api-key> and expose it
as environment variables:

```bash
export FOXBIT_API_KEY="your-api-key"
export FOXBIT_API_SECRET="your-api-secret"
```

Or place them in a `.env` file and pass it with `--env-file` (see below). The
program fails fast with a clear message if either variable is missing.

## Run with Docker

```bash
docker build -t foxbit-sample-sdk-python .

# Pass the variables from your shell...
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-sdk-python

# ...or from a .env file:
docker run --rm --env-file .env foxbit-sample-sdk-python
```

## Run natively

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python example.py
```

## How request signing works

This example signs authenticated requests with HMAC-SHA256 over a canonical
prehash (`timestamp + method + path + decoded query string + raw body`). The
`foxbit-group-rest-api` SDK builds this prehash and signs each request
internally — you only provide the API key and secret to `Configuration`. The
SDK also supports Ed25519 keys (recommended by the SDK) via `private_key` instead
of `api_secret`. Public endpoints such as the order book require no
authentication.

For the full API reference, see the
[Foxbit API documentation](https://docs.foxbit.com.br/rest/v3/).

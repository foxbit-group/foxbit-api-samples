# Foxbit REST API v3 — Examples

Sample code showing how to integrate with the [Foxbit REST API v3](https://docs.foxbit.com.br/rest/v3/) in 12 programming languages. Every example implements the same flow with the same request-signing logic, so you can pick your language and copy a known-good starting point.

## What every example does

1. `GET /rest/v3/me` — fetches your account info (authenticated).
2. `GET /rest/v3/markets/btcbrl/orderbook?depth=1` — fetches the order book (public endpoint, no authentication required).
3. Computes a safe limit price: 50% of the current best bid. This keeps the order inside the API price band (prices too far from the market are rejected with HTTP 422) while being far too low to ever fill.
4. `POST /rest/v3/orders` — places a **real** LIMIT BUY order for 0.0001 BTC at that price (authenticated).
5. Waits 2 seconds.
6. `GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE` — lists active orders; the new order shows up here (authenticated).
7. `PUT /rest/v3/orders/cancel` — cancels the order created in step 4 (authenticated).

> **Warning**: step 4 places a real order on your account. It sits ~50% below the market and is cancelled by the example itself a few seconds later, but always double-check before running against an account with funds at play.

## Languages

| Language | Directory |
|----------|-----------|
| JavaScript (Node.js) | [javascript](javascript/) |
| TypeScript | [typescript](typescript/) |
| Python | [python](python/) |
| Go | [go](go/) |
| Ruby | [ruby](ruby/) |
| PHP | [php](php/) |
| Java | [java](java/) |
| Kotlin | [kotlin](kotlin/) |
| C# (.NET) | [dotnet](dotnet/) |
| C++ | [cpp](cpp/) |
| Dart | [dart](dart/) |
| Swift | [swift](swift/) |

Each directory ships a pinned `Dockerfile`, so the recommended way to run any example is:

```bash
cd rest-v3/<language>
docker build -t foxbit-sample-<language> .
docker run --rm -e FOXBIT_API_KEY -e FOXBIT_API_SECRET foxbit-sample-<language>
```

You can also keep the credentials in a `.env` file (never commit it!) and use `docker run --rm --env-file ../../.env foxbit-sample-<language>`. Native (non-Docker) instructions are in each language README.

## Credentials

Generate an API key and secret at [app.foxbit.com.br/profile/api-key](https://app.foxbit.com.br/profile/api-key) and export them:

```bash
export FOXBIT_API_KEY=your_api_key_here
export FOXBIT_API_SECRET=your_api_secret_here
```

## How request signing works

Authenticated endpoints require three headers:

| Header | Value |
|--------|-------|
| `X-FB-ACCESS-KEY` | your API key |
| `X-FB-ACCESS-TIMESTAMP` | UNIX timestamp in **milliseconds** |
| `X-FB-ACCESS-SIGNATURE` | hex-encoded HMAC-SHA256 of the prehash string, keyed with your API secret |

The prehash string is the concatenation:

```
preHash = timestamp + method + path + queryString + rawBody
```

For example: `1700000000000GET/rest/v3/ordersmarket_symbol=btcbrl&state=ACTIVE`

Two details cause almost every "Invalid signature" (HTTP 401, code 2002) error, and every example in this repository handles both correctly:

1. **The query string is signed in decoded form, but sent percent-encoded.** The server rebuilds the prehash from the *decoded* parameter values, in the order they appear in the URL. If a value contains a space, sign `symbol=btc brl` but send `symbol=btc%20brl` (RFC 3986 encoding — space is `%20`, never `+`). Never let your HTTP library re-serialize the query independently from the string you signed: build both strings from the same ordered parameter list.
2. **The body is signed exactly as the bytes you send.** Serialize the JSON body **once**, sign that exact string, and send that exact string. If your HTTP library re-serializes the object (different key order, different whitespace), the signature breaks. Any JSON formatting is accepted, as long as the signed bytes equal the sent bytes.

Public endpoints (market data such as the order book) need no authentication headers at all.

The optional `X-FB-RECEIVE-WINDOW` header (1000–60000, in ms) narrows how far your timestamp may drift from the server clock. See the [official documentation](https://docs.foxbit.com.br/rest/v3/) for details, including the alternative Ed25519 signing scheme.

## Troubleshooting

- **401 `Invalid signature.` (code 2002)** — check the two gotchas above; print your prehash and compare it char by char with what you expect the server to rebuild. Also confirm the timestamp is in milliseconds and the same value goes into both the prehash and the header.
- **422 `Price out of range from market.` (code 5005)** — your limit price is too far from the current market. The examples avoid this by pricing relative to the live order book instead of hardcoding a value.
- **429** — you are being rate limited; back off and retry.

## License

This project is licensed under the MIT License — see the [LICENSE](../LICENSE.md) file for details.

## Disclaimer

These examples are provided "as is" for educational purposes. Review and test the code thoroughly before using it in a production environment.

"""Foxbit REST API v3 example.

Runs a full order lifecycle against https://api.foxbit.com.br: fetches
account info, reads the public orderbook, places a LIMIT BUY order priced
far below the market, lists active orders and cancels the order.

API docs: https://docs.foxbit.com.br/rest/v3/
"""

import hashlib
import hmac
import json
import math
import os
import sys
import time
from urllib.parse import quote, urlencode

import requests

API_BASE_URL = "https://api.foxbit.com.br"
API_KEY = os.getenv("FOXBIT_API_KEY", "")
API_SECRET = os.getenv("FOXBIT_API_SECRET", "")


def encode_query(params):
    """Encode params for the URL per RFC 3986 (space is %20, never +)."""
    return urlencode(params, safe="", quote_via=quote)


def decoded_query(params):
    """Build the raw (decoded) query string that goes into the prehash."""
    return "&".join(f"{key}={value}" for key, value in params.items())


def sign(method, path, query, raw_body, timestamp):
    """Return the HMAC-SHA256 signature (hex) for a request.

    prehash = timestamp + method + path + query + raw_body

    Gotcha 1: `query` must be the DECODED query string (raw values, no
    percent-encoding) even though the URL carries the encoded form -- the
    server rebuilds the prehash from decoded values.
    Gotcha 2: `raw_body` must be the exact string sent on the wire --
    serialize the body once, then sign and send that same string.
    """
    prehash = f"{timestamp}{method}{path}{query}{raw_body}"
    print("PreHash:", prehash)
    return hmac.new(API_SECRET.encode(), prehash.encode(), hashlib.sha256).hexdigest()


def request(method, path, params=None, body=None, authenticated=True):
    """Send a request to the API and return the parsed JSON response.

    The encoded query (for the URL) and the decoded query (for the prehash)
    are built from the same ordered `params`, and the body is serialized
    exactly once, so the signed strings can never diverge from those sent.
    """
    print("-" * 50)
    print(method, path)

    method = method.upper()
    url = API_BASE_URL + path
    if params:
        url += "?" + encode_query(params)
    raw_body = json.dumps(body, separators=(",", ":")) if body is not None else ""

    headers = {"Content-Type": "application/json"}
    if authenticated:
        timestamp = str(int(time.time() * 1000))
        query = decoded_query(params) if params else ""
        headers["X-FB-ACCESS-KEY"] = API_KEY
        headers["X-FB-ACCESS-TIMESTAMP"] = timestamp
        headers["X-FB-ACCESS-SIGNATURE"] = sign(method, path, query, raw_body, timestamp)

    # data= sends raw_body byte for byte; json= would re-serialize the body
    # and could produce different bytes than the ones that were signed.
    response = requests.request(method, url, headers=headers, data=raw_body or None)
    print(f"Response ({response.status_code}): {response.text}")
    if not 200 <= response.status_code < 300:
        sys.exit(f"{method} {path} failed with status {response.status_code}")
    return response.json()


def main():
    if not API_KEY or not API_SECRET:
        sys.exit("Set the FOXBIT_API_KEY and FOXBIT_API_SECRET environment variables.")

    # 1. Fetch account information (authenticated, no params).
    request("GET", "/rest/v3/me")

    # 2. Fetch the top of the btcbrl orderbook (public endpoint, no auth).
    orderbook = request(
        "GET",
        "/rest/v3/markets/btcbrl/orderbook",
        params={"depth": "1"},
        authenticated=False,
    )
    best_bid = float(orderbook["bids"][0][0])

    # 3. Price the order at 50% of the best bid: inside the price band the
    #    API accepts (an absurd price like 10.0 is rejected with 422) yet far
    #    too low to ever fill. btcbrl uses price_increment 1.0, so the price
    #    must be a whole number.
    price = str(math.floor(best_bid * 0.5))

    # 4. Place a LIMIT BUY order for 0.0001 BTC.
    order = request(
        "POST",
        "/rest/v3/orders",
        body={
            "market_symbol": "btcbrl",
            "side": "BUY",
            "type": "LIMIT",
            "price": price,
            "quantity": "0.0001",
        },
    )
    order_id = order["id"]

    # 5. Give the order a moment to show up in the active list.
    time.sleep(2)

    # 6. List active orders -- the order placed above should appear.
    request(
        "GET",
        "/rest/v3/orders",
        params={"market_symbol": "btcbrl", "state": "ACTIVE"},
    )

    # 7. Cancel the order placed in step 4.
    request("PUT", "/rest/v3/orders/cancel", body={"type": "ID", "id": order_id})


if __name__ == "__main__":
    main()

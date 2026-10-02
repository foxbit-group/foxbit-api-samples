"""Foxbit REST API v3 example using the official Python SDK.

The SDK (foxbit-group-rest-api) signs every authenticated request
internally, so this example contains no signing code. Flow:

  1. GET  /rest/v3/me                                — current member info
  2. GET  /rest/v3/markets/btcbrl/orderbook?depth=1  — best bid (public)
  3. Compute a limit price at 50% of the best bid, floored to an integer
  4. POST /rest/v3/orders                            — LIMIT BUY at that price
  5. Wait 2 seconds
  6. GET  /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE
  7. PUT  /rest/v3/orders/cancel                     — cancel the order

API docs: https://docs.foxbit.com.br/rest/v3/
"""

import math
import os
import sys
import time

from foxbit_group.rest_api import ApiClient, Configuration
from foxbit_group.rest_api.api import MarketDataApi, MemberInfoApi, TradingApi
from foxbit_group.rest_api.exceptions import ApiException
from foxbit_group.rest_api.models import (
    CancelOrdersRequest,
    CreateOrderRequest,
    OrderLimit,
    OrdersCancelId,
)

MARKET_SYMBOL = "btcbrl"
QUANTITY = "0.0001"
# Limit price as a fraction of the best bid. The API rejects prices too far
# from the market (422, code 5005); the band width is not documented.
PRICE_FACTOR = 0.5


def log_step(title, model):
    print("-" * 50)
    print(title)
    print(model.to_json())


def main():
    api_key = os.getenv("FOXBIT_API_KEY")
    api_secret = os.getenv("FOXBIT_API_SECRET")
    # Fail fast if credentials are missing. Never print their values.
    if not api_key or not api_secret:
        sys.exit("Set the FOXBIT_API_KEY and FOXBIT_API_SECRET environment variables.")

    # The SDK signs each authenticated call with HMAC-SHA256 and applies safe
    # defaults: timeouts, a receive window and no redirects.
    config = Configuration(api_key=api_key, api_secret=api_secret)

    with ApiClient(config) as client:
        member_api = MemberInfoApi(client)
        market_api = MarketDataApi(client)
        trading_api = TradingApi(client)

        # 1. Authenticated request: the account tied to the API key.
        log_step("GET /rest/v3/me", member_api.current_member())

        # 2. Public request: the top of the order book.
        orderbook = market_api.get_orderbook(MARKET_SYMBOL, depth=1)
        log_step(f"GET /rest/v3/markets/{MARKET_SYMBOL}/orderbook?depth=1", orderbook)
        if not orderbook.bids:
            raise RuntimeError(f"No bids available for market {MARKET_SYMBOL}")
        best_bid = float(orderbook.bids[0][0])

        # 3. 50% of the best bid stays inside the price band yet never fills.
        #    btcbrl uses price_increment 1.0, so the price must be an integer.
        price = str(math.floor(best_bid * PRICE_FACTOR))

        # 4. Authenticated request: place a REAL limit buy order.
        created = trading_api.create_order(
            CreateOrderRequest(
                OrderLimit(
                    market_symbol=MARKET_SYMBOL,
                    side="BUY",
                    type="LIMIT",
                    price=price,
                    quantity=QUANTITY,
                )
            )
        )
        log_step("POST /rest/v3/orders", created)
        if created.id is None:
            raise RuntimeError("Order created but no id was returned")

        try:
            # 5. Give the matching engine a moment to register the order.
            time.sleep(2)

            # 6. Authenticated request: the new order should be listed as active.
            active = trading_api.list_orders(market_symbol=MARKET_SYMBOL, state="ACTIVE")
            log_step(f"GET /rest/v3/orders?market_symbol={MARKET_SYMBOL}&state=ACTIVE", active)
        finally:
            # 7. Authenticated request: cancel the order created in step 4.
            #    Runs even if step 5 or 6 failed, so no real order is left open.
            try:
                canceled = trading_api.cancel_orders(
                    CancelOrdersRequest(OrdersCancelId(type="ID", id=created.id))
                )
            except Exception:
                print(f"Could not cancel order {created.id}; cancel it manually.", file=sys.stderr)
                raise
            log_step("PUT /rest/v3/orders/cancel", canceled)


if __name__ == "__main__":
    try:
        main()
    except ApiException as error:
        # Only the status and the API body: never dump headers or config.
        sys.exit(f"Request failed ({error.status}): {error.body}")
    except Exception as error:
        sys.exit(f"Error: {error}")

import json
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
TIMEOUT_SECONDS = 30

# Fail fast if credentials are missing, before making any request.
api_key = os.getenv("FOXBIT_API_KEY")
api_secret = os.getenv("FOXBIT_API_SECRET")
if not api_key or not api_secret:
    sys.exit(
        "Missing credentials. Set FOXBIT_API_KEY and FOXBIT_API_SECRET.\n"
        "Create an API key at https://app.foxbit.com.br/profile/api-key"
    )


# The SDK raises ApiException subclasses for HTTP and network errors.
# Print only the status and the API body, never the request headers.
def describe_error(error):
    if isinstance(error, ApiException) and error.status:
        return f"HTTP {error.status}: {error.body}"
    return str(error)


def log_step(title, payload):
    print("--------------------------------------------------")
    print(title)
    print(json.dumps(payload.to_dict(), indent=2))


def main():
    # The official SDK signs every authenticated request for us
    # (HMAC-SHA256 over the canonical prehash). We only supply the
    # API key/secret here; the signing details are internal to the SDK.
    config = Configuration(
        api_key=api_key,
        api_secret=api_secret,
        timeout=TIMEOUT_SECONDS,
    )

    with ApiClient(config) as client:
        member_api = MemberInfoApi(client)
        market_api = MarketDataApi(client)
        trading_api = TradingApi(client)

        # 1. Authenticated request: fetch the account tied to the API key.
        me = member_api.current_member()
        log_step("GET /rest/v3/me", me)

        # 2. Public request (no authentication required): read the top of the
        #    order book so we can price the order relative to the live market.
        orderbook = market_api.get_orderbook(MARKET_SYMBOL, depth=1)
        # Each level is a [price, quantity] pair.
        best_bid = orderbook.bids[0][0] if orderbook.bids else None
        if not best_bid:
            raise RuntimeError(f"No bids available for market {MARKET_SYMBOL}")

        # 3. Price at 50% of the best bid, floored to an integer. The btcbrl
        #    market has price_increment 1.0, so the price must be a whole number.
        #    Pricing off the live market keeps us inside the exchange price band
        #    (a hardcoded value such as 10.0 is rejected with HTTP 422 "Price out
        #    of range") while staying far enough below market that the order never
        #    executes before we cancel it.
        price = str(math.floor(float(best_bid) * PRICE_FACTOR))
        print("--------------------------------------------------")
        print(f"Best bid: {best_bid} -> limit price: {price}")

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

        order_id = created.id
        if order_id is None:
            raise RuntimeError("Order created but no id was returned")

        try:
            # 5. Give the matching engine a moment to register the order.
            time.sleep(2)

            # 6. Authenticated request: list active orders. The order we just
            #    placed should appear in the result.
            active = trading_api.list_orders(market_symbol=MARKET_SYMBOL, state="ACTIVE")
            log_step("GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE", active)
        finally:
            # 7. Authenticated request: cancel the order we created. Runs even
            #    if step 5 or 6 failed, so no real order is left open.
            try:
                canceled = trading_api.cancel_orders(
                    CancelOrdersRequest(OrdersCancelId(type="ID", id=order_id))
                )
            except Exception:
                print(f"Could not cancel order {order_id}; cancel it manually.", file=sys.stderr)
                raise
            log_step("PUT /rest/v3/orders/cancel", canceled)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Request failed:", describe_error(error), file=sys.stderr)
        sys.exit(1)

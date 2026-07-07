import {
  Configuration,
  MarketDataApi,
  MemberInfoApi,
  TradingApi,
} from "@foxbit-group/rest-api";

const MARKET_SYMBOL = "btcbrl";
const QUANTITY = "0.0001";

// Fail fast if credentials are missing, before making any request.
const apiKey = process.env.FOXBIT_API_KEY;
const apiSecret = process.env.FOXBIT_API_SECRET;
if (!apiKey || !apiSecret) {
  console.error(
    "Missing credentials. Set FOXBIT_API_KEY and FOXBIT_API_SECRET.\n" +
      "Create an API key at https://app.foxbit.com.br/profile/api-key",
  );
  process.exit(1);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// The SDK throws axios-style errors. Narrow them for readable logging
// without pulling axios in as a direct dependency.
interface HttpError {
  response?: { status?: number; data?: unknown };
  message?: string;
}

function describeError(error: unknown): string {
  const err = error as HttpError;
  if (err?.response) {
    return `HTTP ${err.response.status ?? "?"}: ${JSON.stringify(err.response.data)}`;
  }
  return err?.message ?? String(error);
}

function logStep(title: string, payload: unknown): void {
  console.log("--------------------------------------------------");
  console.log(title);
  console.log(JSON.stringify(payload, null, 2));
}

async function main(): Promise<void> {
  // The official SDK signs every authenticated request for us
  // (HMAC-SHA256 over the canonical prehash). We only supply the
  // API key/secret here; the signing details are internal to the SDK.
  const config = new Configuration({ apiKey, apiSecret });
  const memberApi = new MemberInfoApi(config);
  const marketApi = new MarketDataApi(config);
  const tradingApi = new TradingApi(config);

  // 1. Authenticated request: fetch the account tied to the API key.
  const me = await memberApi.currentMember();
  logStep("GET /rest/v3/me", me.data);

  // 2. Public request (no authentication required): read the top of the
  //    order book so we can price the order relative to the live market.
  const orderbook = await marketApi.getOrderbook({
    marketSymbol: MARKET_SYMBOL,
    depth: 1,
  });
  // Each level is a [price, quantity] pair; the SDK types it loosely as
  // string[], so we cast to the real shape.
  const bids = orderbook.data.bids as unknown as string[][];
  const bestBid = bids[0]?.[0];
  if (!bestBid) {
    throw new Error(`No bids available for market ${MARKET_SYMBOL}`);
  }

  // 3. Price at 50% of the best bid, floored to an integer. The btcbrl
  //    market has price_increment 1.0, so the price must be a whole number.
  //    Pricing off the live market keeps us inside the exchange price band
  //    (a hardcoded value such as 10.0 is rejected with HTTP 422 "Price out
  //    of range") while staying far enough below market that the order never
  //    executes before we cancel it.
  const price = Math.floor(Number(bestBid) * 0.5).toString();
  console.log("--------------------------------------------------");
  console.log(`Best bid: ${bestBid} -> limit price: ${price}`);

  // 4. Authenticated request: place a REAL limit buy order.
  const created = await tradingApi.createOrder({
    createOrderRequest: {
      market_symbol: MARKET_SYMBOL,
      side: "BUY",
      type: "LIMIT",
      price,
      quantity: QUANTITY,
    },
  });
  logStep("POST /rest/v3/orders", created.data);

  const orderId = created.data.id;
  if (orderId === undefined) {
    throw new Error("Order created but no id was returned");
  }

  // 5. Give the matching engine a moment to register the order.
  await sleep(2000);

  // 6. Authenticated request: list active orders. The order we just placed
  //    should appear in the result.
  const active = await tradingApi.listOrders({
    marketSymbol: MARKET_SYMBOL,
    state: "ACTIVE",
  });
  logStep("GET /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE", active.data);

  // 7. Authenticated request: cancel the order we created.
  const canceled = await tradingApi.cancelOrders({
    cancelOrdersRequest: { type: "ID", id: orderId },
  });
  logStep("PUT /rest/v3/orders/cancel", canceled.data);
}

main().catch((error) => {
  console.error("Request failed:", describeError(error));
  process.exit(1);
});

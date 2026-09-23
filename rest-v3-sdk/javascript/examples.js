"use strict";

/**
 * Foxbit REST API v3 example using the official JavaScript SDK
 * (@foxbit-group/rest-api). The SDK signs every authenticated request
 * internally (HMAC-SHA256 headers), so no manual signing code is needed.
 *
 * Flow:
 *   1. GET  /rest/v3/me                                    — current member info
 *   2. GET  /rest/v3/markets/btcbrl/orderbook?depth=1      — best bid (public data)
 *   3. Compute a limit price at 50% of the best bid (floored to an integer)
 *   4. POST /rest/v3/orders                                — LIMIT BUY at the computed price
 *   5. Wait 2 seconds
 *   6. GET  /rest/v3/orders?market_symbol=btcbrl&state=ACTIVE
 *   7. PUT  /rest/v3/orders/cancel                         — cancel the created order
 */

const {
  Configuration,
  MarketDataApi,
  MemberInfoApi,
  TradingApi,
} = require("@foxbit-group/rest-api");

const MARKET_SYMBOL = "btcbrl";
// Limit price as a fraction of the best bid. The API rejects prices too far
// from the market (422, code 5005); the band width is not documented.
const PRICE_FACTOR = 0.5;
const TIMEOUT_MS = 30_000;

// Fail fast if credentials are missing. Never print their values.
for (const name of ["FOXBIT_API_KEY", "FOXBIT_API_SECRET"]) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logStep(title, response) {
  console.log("-".repeat(50));
  console.log(title);
  console.log(`Response (${response.status}): ${JSON.stringify(response.data)}`);
}

// Print only safe error details (HTTP status + response body). Never dump the
// whole Axios error object: its request config carries the signed auth headers.
function fail(error) {
  if (error.response) {
    const body = JSON.stringify(error.response.data);
    console.error(`Request failed (${error.response.status}): ${body}`);
  } else {
    console.error(`Request failed: ${error.message}`);
  }
  process.exit(1);
}

async function main() {
  const configuration = new Configuration({
    apiKey: process.env.FOXBIT_API_KEY,
    apiSecret: process.env.FOXBIT_API_SECRET,
    // baseOptions is merged into every axios request by the SDK.
    baseOptions: { timeout: TIMEOUT_MS },
  });

  const memberApi = new MemberInfoApi(configuration);
  const marketDataApi = new MarketDataApi(configuration);
  const tradingApi = new TradingApi(configuration);

  // 1. Authenticated request: current member info.
  const me = await memberApi.currentMember();
  logStep("GET /rest/v3/me", me);

  // 2. Public market data: fetch the top of the order book.
  const orderbook = await marketDataApi.getOrderbook({
    marketSymbol: MARKET_SYMBOL,
    depth: 1,
  });
  logStep(`GET /rest/v3/markets/${MARKET_SYMBOL}/orderbook?depth=1`, orderbook);
  const bestBid = Number(orderbook.data.bids[0][0]);

  // 3. Price the order at 50% of the best bid, rounded to an integer
  // (btcbrl has price_increment 1.0). This stays inside the exchange's
  // accepted price band — a hardcoded value like 10.0 is rejected with
  // 422 "Price out of range" — while being far too low to ever execute.
  const price = String(Math.floor(bestBid * PRICE_FACTOR));

  // 4. Create the order at the computed price.
  const created = await tradingApi.createOrder({
    createOrderRequest: {
      market_symbol: MARKET_SYMBOL,
      side: "BUY",
      type: "LIMIT",
      price,
      quantity: "0.0001",
    },
  });
  logStep("POST /rest/v3/orders", created);
  const orderId = created.data.id;

  // 5. Give the matching engine a moment before listing orders.
  await sleep(2000);

  // 6. List active orders — the order created above should be in the list.
  const active = await tradingApi.listOrders({
    marketSymbol: MARKET_SYMBOL,
    state: "ACTIVE",
  });
  logStep(`GET /rest/v3/orders?market_symbol=${MARKET_SYMBOL}&state=ACTIVE`, active);

  // 7. Cancel the order created in step 4 by its id.
  const canceled = await tradingApi.cancelOrders({
    cancelOrdersRequest: { type: "ID", id: orderId },
  });
  logStep("PUT /rest/v3/orders/cancel", canceled);
}

main().catch(fail);

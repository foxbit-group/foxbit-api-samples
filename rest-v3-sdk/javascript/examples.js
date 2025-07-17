const {
  Configuration,
  MemberInfoApi,
  TradingApi,
} = require("@foxbit-group/rest-api");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  try {
    console.log("FOXBIT_API_KEY:", process.env.FOXBIT_API_KEY);

    const config = new Configuration({
      apiKey: process.env.FOXBIT_API_KEY,
      apiSecret: process.env.FOXBIT_API_SECRET,
    });

    // Create instance of the API clients
    const memberApi = new MemberInfoApi(config);
    const tradingApi = new TradingApi(config);

    // Get the user information
    const meResponse = await memberApi.currentMember();
    console.log("Response:", meResponse.data);

    // Request to create a new order
    const orderResponse = await tradingApi.createOrder({
      createOrderRequest: {
        market_symbol: "btcbrl",
        side: "BUY",
        type: "LIMIT",
        price: "500000.0",
        quantity: "0.0001",
      },
    });
    console.log("Response:", orderResponse.data);

    await sleep(2000);

    // Get active orders
    const ordersResponse = await tradingApi.listOrders({
      marketSymbol: "btcbrl",
      state: "ACTIVE",
    });
    console.log("Response:", ordersResponse.data);

    // Request to get the order book
    const cancelResponse = await tradingApi.cancelOrders({
      cancelOrdersRequest: {
        type: "ID",
        id: orderResponse.data.id,
      },
    });
    console.log("Response:", cancelResponse.data);
  } catch (error) {
    console.error("Failed to process request.", error.response.data);
  }
})();

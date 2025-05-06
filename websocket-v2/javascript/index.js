// Instantiate Websocket module
const WebSocket = require("ws");
const crypto = require("crypto-js");
const { select } = require("@inquirer/prompts");

// WebSocketAPI setup
const wsAddress = "wss://api.foxbit.com.br/";
const ws = new WebSocket(wsAddress);

// Credentials
const userId = process.env.FOXBIT_USER_ID;
const apiKey = process.env.FOXBIT_API_KEY;
const apiSecret = process.env.FOXBIT_API_SECRET;

// Authentication setup
const nonce = Date.now();
const signatureData = nonce + userId + apiKey;
const signature = crypto
  .HmacSHA256(signatureData, apiSecret)
  .toString(crypto.enc.Hex);

// Message Frame
const messageFrame = {
  m: 0, // MessageType ( 0_Request / 1_Reply / 2_Subscribe / 3_Event / 4_Unsubscribe / Error )
  i: 1, // Sequence Number
  n: "", // Function Name
  o: "", // Payload
};

// Open connection to websocket
ws.onopen = () => {
  console.log("Connect to v2 WebSocket!");

  // Send a message to AuthenticateUser
  ws.send(
    JSON.stringify({
      ...messageFrame,
      n: "AuthenticateUser",
      o: JSON.stringify({
        APIKey: apiKey,
        Nonce: nonce,
        UserId: userId,
        Signature: signature,
      }),
    })
  );
};

// Logs the result of any message
ws.on("message", (data) => {
  const result = JSON.parse(data);
  const resultFrame = result.n;
  const resultPayload = JSON.parse(result.o);

  console.log({ resultFrame, resultPayload });

  if (resultFrame === "AuthenticateUser" && resultPayload.Authenticated) {
    console.log("User authenticated:", resultPayload);
    handleChannelChoice();
  }

  if (resultFrame === "AuthenticateUser" && !resultPayload.Authenticated) {
    console.error("Authentication error: ", resultPayload);

    setTimeout(function () {
      closeConn();
    }, 200);
  }
});

// Handle errors in connection
ws.onerror = (error) => {
  console.log("Error: " + JSON.stringify(error));

  setTimeout(function () {
    closeConn();
  }, 200);
};

// Close connection
ws.onclose = () => {
  console.log("Connection closed!");
  process.exit(0);
};

function closeConn() {
  setTimeout(function () {
    ws.close();
  }, 200);
}

// User's interface
async function handleChannelChoice() {
  const channel = await select({
    message: "Select a channel to use",
    choices: [
      { name: "SubscribeLevel1", value: "SubscribeLevel1" },
      { name: "SubscribeLevel2", value: "SubscribeLevel2" },
      { name: "SubscribeAccountEvents", value: "SubscribeAccountEvents" },
    ],
  });

  console.log("Channel selected: ", channel);

  switch (channel) {
    case "SubscribeLevel1":
      subscribeLevel1();
      break;
    case "SubscribeLevel2":
      subscribeLevel2();
      break;
    case "SubscribeAccountEvents":
      subscribeAccountEvents();
      break;
    default:
      console.log("Channel not allowed!");
      closeConn();
      break;
  }
}

// Function to subscribe on the public channel SubscribeLevel1
function subscribeLevel1() {
  console.log("SubscribeLevel1");

  ws.send(
    JSON.stringify({
      ...messageFrame,
      n: "SubscribeLevel1",
      o: JSON.stringify({ OMSId: 1, MarketId: "btcbrl" }),
    })
  );
}

// Function to subscribe on the public channel SubscribeLevel2
function subscribeLevel2() {
  console.log("SubscribeLevel2");

  ws.send(
    JSON.stringify({
      ...messageFrame,
      n: "SubscribeLevel2",
      o: JSON.stringify({ OMSId: 1, MarketId: "btcbrl", Depth: 10 }),
    })
  );
}

// Function to subscribe on the private channel SubscribeAccountEvents
function subscribeAccountEvents() {
  console.log("SubscribeAccountEvents");

  ws.send(
    JSON.stringify({
      ...messageFrame,
      n: "SubscribeAccountEvents",
      o: JSON.stringify({}),
    })
  );
}

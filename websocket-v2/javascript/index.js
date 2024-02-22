// Instantiate Websocket module
const WebSocket = require("ws");
const crypto = require('crypto-js');
const readline = require('readline');

// Creating user interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// WebSocketAPI setup
const wsAddress = "";
const ws = new WebSocket(wsAddress);


// Credentials
const userId = "";
const apiKey = "";
const apiSecret = "";

// Authentication setup
const nonce = Date.now();
const signatureData = nonce + userId + apiKey;
const signature = crypto.HmacSHA256(signatureData, apiSecret).toString(crypto.enc.Hex);

// Message Frame
const messageFrame = {
  m: 0, // MessageType ( 0_Request / 1_Reply / 2_Subscribe / 3_Event / 4_Unsubscribe / Error )
  i: 1, // Sequence Number
  n: "", // Function Name
  o: "", // Payload
};

// Open connection to websocket
ws.onopen = () => {
  console.log("Connect to v2 Websocket!")

  // Send a message to AuthenticateUser
  ws.send(JSON.stringify({
    ...messageFrame,
    n: "AuthenticateUser",
    o: JSON.stringify({APIKey: apiKey, Nonce: nonce, UserId: userId, Signature: signature})
  }));
};

// Logs the result of any message
ws.on('message', (data) => {
  const result = JSON.parse(data);
  const resultFrame = result.n;
  const resultPayload = JSON.parse(result.o);

  console.log({ resultFrame, resultPayload })
  
  if(resultFrame === "AuthenticateUser" && resultPayload.Authenticated) {
    console.log("User authenticated:", resultPayload)
    handleChannelChoice();
  }

  if(resultFrame === "AuthenticateUser" && !resultPayload.Authenticated) {
    console.error("Authentication error: ", resultPayload);

    setTimeout(function() {
      closeConn();
    }, 200);
  }
});

// Handle errors in connection
ws.onerror = (error) => {
  console.log("Error: " + JSON.stringify(error));

  setTimeout(function() {
    closeConn();
}, 200);
};

// Close connection
ws.onclose = () => {
  console.log("Connection closed!")
};

function closeConn() {
  setTimeout(function() {
    ws.close();
}, 200);
}

// User's interface
function handleChannelChoice() {
  rl.question('Select a channel to use (SubscribeLevel2, SubscribeAccountEvents): ', (channel) => {
    console.log("Channel selected: ", channel);

      switch(channel) {
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

    rl.close();
  });
}

// Function to subscribe on the public channel SubscribeLevel2
function subscribeLevel2() {
  console.log("SubscribeLevel2");

   ws.send(JSON.stringify({
    ...messageFrame,
    n: 'SubscribeLevel2',
    o: JSON.stringify({ OMSId: 1, MarketId: "btcbrl", Depth: 10 })
  }));
}

// Function to subscribe on the private channel SubscribeAccountEvents
function subscribeAccountEvents() {
  console.log("SubscribeAccountEvents");
  
  ws.send(JSON.stringify({
    ...messageFrame,
    n: 'SubscribeAccountEvents',
    o: JSON.stringify({})
  }));
}

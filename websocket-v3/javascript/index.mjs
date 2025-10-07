import ws from 'ws';
import { select } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';

const address = 'wss://api.foxbit.com.br/ws/v3/public';
const wss = new ws(address);

const logFileName = `websocket-logs-${new Date()
  .toISOString()
  .replace(/[:.]/g, '-')}.log`;
const logPath = path.join(process.cwd(), 'logs', logFileName);

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, logEntry);
}

console.log(`📝 Logs will be saved to: ${logFileName}`);
console.log('🔗 To follow logs in real time, open another terminal and run:');
console.log(`   tail -f ${logFileName}`);
console.log('─'.repeat(60));

function sendMessage(message) {
  writeLog('Sending: ' + message);
  wss.send(message);
}

wss.on('open', async () => {
  writeLog('Connected to v3 WebSocket!');
  console.log('✅ Connected to WebSocket v3!');

  setInterval(() => {
    sendMessage(
      JSON.stringify({
        type: 'message',
        params: [
          {
            channel: 'ping',
          },
        ],
      })
    );
  }, 20_000);

  while (true) {
    await handleChannelChoice();
  }
});

wss.on('message', async (data) => {
  const result = JSON.parse(data);
  writeLog('Received: ' + JSON.stringify(result));

  if (result.params?.channel === 'ping') {
    writeLog(`Pong received: ${JSON.stringify(result.data)}`);
  }
});

wss.on('error', (error) => {
  writeLog('Error: ' + JSON.stringify(error));
  console.log('❌ WebSocket connection error - check log file');

  setTimeout(() => {
    wss.close();
  }, 200);
});

wss.on('close', () => {
  writeLog('Connection closed!');
  console.log('🔌 Connection closed!');
  process.exit(0);
});

function subscribeMessage(channel) {
  return JSON.stringify({
    type: 'subscribe',
    params: [
      {
        channel,
        market_symbol: 'btcbrl',
      },
    ],
  });
}

function unsubscribeMessage(channel) {
  return JSON.stringify({
    type: 'unsubscribe',
    params: [
      {
        channel,
        market_symbol: 'btcbrl',
      },
    ],
  });
}

async function handleChannelChoice() {
  const selectedAction = await select({
    message: 'Select an action (subscribe/unsubscribe):',
    choices: [
      { name: 'Subscribe', value: 'subscribe' },
      { name: 'Unsubscribe', value: 'unsubscribe' },
      { name: 'Exit', value: 'exit' },
    ],
  });

  if (selectedAction === 'exit') {
    console.log('Exiting...');
    wss.close();
    return;
  }

  if (selectedAction === 'subscribe') {
    const channelToSubscribe = await select({
      message: 'Select a channel to subscribe:',
      choices: [
        { name: 'Subscribe Trades', value: subscribeMessage('trades') },
        {
          name: 'Subscribe Order Book',
          value: subscribeMessage('orderbook-1000'),
        },
        { name: 'Subscribe Ticker', value: subscribeMessage('ticker') },
        { name: 'Subscribe Candles', value: subscribeMessage('candles-60') },
      ],
    });
    console.log(`📡 Subscribed to channel, see logs file for details.`);
    writeLog(`Subscribing to channel: ${channelToSubscribe}`);
    sendMessage(channelToSubscribe);
    return;
  }

  if (selectedAction === 'unsubscribe') {
    const channelToUnsubscribe = await select({
      message: 'Select a channel to unsubscribe:',
      choices: [
        { name: 'Unsubscribe Trades', value: unsubscribeMessage('trades') },
        {
          name: 'Unsubscribe Order Book',
          value: unsubscribeMessage('orderbook-1000'),
        },
        { name: 'Unsubscribe Ticker', value: unsubscribeMessage('ticker') },
        {
          name: 'Unsubscribe Candles',
          value: unsubscribeMessage('candles-60'),
        },
      ],
    });
    console.log(`📡 Unsubscribing from channel...`);
    writeLog(`Unsubscribing from channel: ${channelToUnsubscribe}`);
    sendMessage(channelToUnsubscribe);
    return;
  }
}

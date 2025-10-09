import ws from 'ws';
import { select } from '@inquirer/prompts';
import BTree from 'sorted-btree';
import http from 'http';

export function BTreeAsc(entries) {
  return new BTree.default(entries, (a, b) => +a - +b);
}

export function BTreeDesc(entries) {
  return new BTree.default(entries, (a, b) => +b - +a);
}

class Manager {
  /** @type {ws | null} */
  wss = null;
  orderBook = {
    sequence_id: 0,
    bids: [],
    asks: [],
  };

  constructor(
    address = 'wss://api.foxbit.com.br/ws/v3/public',
    market_symbol = 'btcbrl',
    interval = '250'
  ) {
    this.market_symbol = market_symbol;
    this.interval = interval;
    this.address = address;
    this.setupWebSocket();
  }

  setupWebSocket() {
    if (
      !this.wss ||
      [this.wss.CLOSED, this.wss.CLOSING].includes(this.wss.readyState)
    ) {
      this.wss = new ws(this.address);
      return this.setupWebSocket();
    }

    this.wss.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      this.setupWebSocket();
    });
    this.wss.on('close', () => {
      console.log('❌ WebSocket connection closed');
      this.setupWebSocket();
    });

    this.wss.on('open', () => {
      console.log('✅ WebSocket connection opened');

      this.wss.send(
        JSON.stringify({
          type: 'subscribe',
          params: [
            {
              channel: `orderbook-${this.interval}`,
              market_symbol: this.market_symbol,
              snapshot: true,
            },
          ],
        })
      );
    });

    this.wss.on('message', (data) => {
      const message = JSON.parse(data);
      console.log('📨 Message received:', message);

      if (message.event === 'snapshot') {
        console.log('📊 Order book snapshot:', message.data);
        this.orderBook = {
          sequence_id: message.data.sequence_id,
          asks: BTreeAsc(message.data.asks),
          bids: BTreeDesc(message.data.bids),
        };
        console.log('✅ Order book initialized with snapshot');
        return;
      }

      if (message.event === 'update') {
        if (
          this.orderBook.sequence_id + 1 === message.data.first_sequence_id ||
          message.data.first_sequence_id === 1
        ) {
          console.log('🔄 Order book update:', message.data);
          this.orderBook.sequence_id = message.data.last_sequence_id;

          message.data.asks.forEach(([price, volume]) => {
            if (+volume === 0) {
              this.orderBook.asks.delete(price);
            } else {
              this.orderBook.asks.set(price, volume);
            }
          });

          message.data.bids.forEach(([price, volume]) => {
            if (+volume === 0) {
              this.orderBook.bids.delete(price);
            } else {
              this.orderBook.bids.set(price, volume);
            }
          });

          console.log('✅ Order book updated');
          return;
        }

        console.warn('⚠️ Sequence ID mismatch, requesting new snapshot...', {
          actual: this.orderBook.sequence_id,
          received: message.data.first_sequence_id,
        });

        this.wss.send(
          JSON.stringify({
            type: 'subscribe',
            params: [
              {
                channel: `orderbook-${this.interval}`,
                market_symbol: this.market_symbol,
                snapshot: true,
              },
            ],
          })
        );
      }
    });
  }
}

let instance;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/orderbook' && req.method === 'GET' && instance) {
    const orderBookData = {
      market_symbol: instance.market_symbol,
      subscribe_interval: instance.interval,
      sequence_id: instance.orderBook.sequence_id,
      asks: instance.orderBook.asks.toArray(99),
      bids: instance.orderBook.bids.toArray(99),
    };
    res.statusCode = 200;
    res.end(JSON.stringify(orderBookData, null, 2));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(3000, () => {
  console.log('🚀 HTTP server running on http://localhost:3000/orderbook');

  select({
    message: 'Select market symbol to manage order book:',
    choices: ['btcusdt', 'btcbrl', 'ethbrl', 'ethusd'],
  }).then((market_symbol) => {
    select({
      message: 'Select an interval to orderbook updates (ms):',
      choices: ['100', '250', '500', '1000'],
    }).then((interval) => {
      instance = new Manager(
        'wss://api.foxbit.com.br/ws/v3/public',
        market_symbol,
        interval
      );
    });
  });
});

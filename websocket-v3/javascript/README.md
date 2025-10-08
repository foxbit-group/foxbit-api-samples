# Foxbit API WebSocket v3 JavaScript Examples

Here are the JavaScript examples for the Foxbit API WebSocket v3. This section provides an interactive script to help you understand how to interact with the Foxbit WebSocket using JavaScript. These examples cover real-time market data subscription, including trades, order book, ticker, and candles data.

## Prerequisites

Before you begin, ensure you have the following prerequisites installed on your system:

- **Node.js**: These examples are written for Node.js, a JavaScript runtime built on Chrome's V8 JavaScript engine. Ensure you have the latest stable version installed.
- **NPM (Node Package Manager)**: Comes with Node.js, used for managing dependencies.

## Getting Started

1. **Install Dependencies**: Navigate to the JavaScript examples directory in your terminal and run `npm install` to install the necessary dependencies.

   ```bash
   npm install
   ```

2. **Running the Examples**: To run the example, navigate to the project directory in the terminal and execute the following command:

   ```bash
   npm start
   ```

## Features

This WebSocket v3 example provides:

- **Real-time Market Data**: Subscribe to live market data feeds
- **Interactive Menu**: Choose between different data channels using an interactive command-line menu
- **Channel Subscriptions**:
  - **Trades**: Real-time trade executions
  - **Order Book**: Live order book updates (100 miliseconds interval)
  - **Ticker**: 24h market statistics
  - **Candles**: OHLCV candlestick data (60-seconds interval)
- **Automatic Ping/Pong**: Maintains connection with periodic ping messages
- **Comprehensive Logging**: All WebSocket messages are logged to timestamped files in the `logs/` directory
- **Real-time Log Monitoring**: Follow logs in real-time using `tail -f logs/[filename]`

## Available Channels

The example demonstrates subscription to the following channels for the BTC/BRL market:

- `trades` - Real-time trade executions
- `orderbook-100` - Order book updates with 100 miliseconds intervals
- `ticker` - 24-hour market statistics
- `candles-60` - Candlestick data with 60-seconds interval

## Log Files

All WebSocket communications are automatically logged to timestamped files in the `logs/` directory. When you start the application, it will display the log filename and provide a command to follow logs in real-time:

```bash
tail -f logs/websocket-logs-[timestamp].log
```

## Additional Notes

These examples are meant to serve as a starting point. They demonstrate basic WebSocket v3 interactions for public market data. The connection uses the public WebSocket endpoint and doesn't require authentication. It's recommended to review and test the code thoroughly before using it in a production environment. For detailed API documentation, refer to the [Foxbit API Documentation](https://docs.foxbit.com.br/).

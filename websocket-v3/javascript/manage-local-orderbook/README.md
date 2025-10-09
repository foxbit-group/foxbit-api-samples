# Foxbit Local Order Book Manager

A real-time local order book management system that connects to the Foxbit WebSocket API v3 to maintain a synchronized local copy of the order book data.

## Overview

This application demonstrates how to maintain a local order book by connecting to Foxbit's WebSocket v3 API. It efficiently manages order book snapshots and real-time updates, providing a local HTTP server to access the synchronized order book data.

## Features

- **Real-time Order Book Synchronization**: Maintains a local copy of the order book that stays in sync with Foxbit's live data
- **Automatic Snapshot Management**: Handles initial snapshots and automatic re-synchronization on sequence mismatches
- **Efficient Data Structure**: Uses binary trees (B-Tree) for optimal order book management and querying
- **HTTP API Server**: Provides a local REST endpoint to access the current order book state
- **Interactive Market Selection**: Choose from multiple market pairs and update intervals
- **Robust Error Handling**: Automatic reconnection and error recovery mechanisms

## Prerequisites

- **Node.js** (version 18 or higher)
- **npm** (Node Package Manager)

## Installation

1. Navigate to the project directory:
   ```bash
   cd websocket-v3/javascript/manage-local-orderbook
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the application:
   ```bash
   npm start
   ```

2. Follow the interactive prompts to:
   - Select a market symbol (btcusd, btcbrl, ethbrl, ethusd)
   - Choose an update interval (100ms, 250ms, 500ms, 1000ms)

3. The application will:
   - Connect to Foxbit's WebSocket API
   - Initialize the order book with a snapshot
   - Start receiving real-time updates
   - Launch an HTTP server on `http://localhost:3000`

## HTTP API

Once running, you can access the current order book data via HTTP:

### GET /orderbook

Returns the current state of the local order book.

**Response Example:**
```json
{
  "market_symbol": "btcbrl",
  "subscribe_interval": "250",
  "sequence_id": 12345,
  "asks": [
    ["45000.00", "0.5000"],
    ["45100.00", "1.2000"],
    // ...
  ],
  "bids": [
    ["44900.00", "0.8000"],
    ["44800.00", "2.1000"],
    // ...
  ]
}
```

**Response Fields:**
- `market_symbol`: The trading pair being tracked
- `subscribe_interval`: Update interval in milliseconds
- `sequence_id`: Current sequence number for data integrity
- `asks`: Array of ask orders [price, volume] sorted ascending by price
- `bids`: Array of bid orders [price, volume] sorted descending by price

## How It Works

### 1. WebSocket Connection
The application connects to `wss://api.foxbit.com.br/ws/v3/public` and subscribes to the order book channel for the selected market.

### 2. Order Book Initialization
- Receives an initial snapshot containing the complete order book state
- Stores asks in ascending price order and bids in descending price order
- Uses B-Tree data structures for efficient insertions, deletions, and queries

### 3. Real-time Updates
- Processes incremental updates to maintain order book consistency
- Validates sequence IDs to ensure no updates are missed
- Automatically requests new snapshots if sequence mismatches occur

### 4. Data Management
- **Zero Volume Handling**: Automatically removes orders when volume becomes 0
- **Price Level Updates**: Updates existing price levels or adds new ones
- **Sequence Validation**: Ensures data integrity through sequence ID checking

## Dependencies

- **ws**: WebSocket client for Node.js
- **@inquirer/prompts**: Interactive command-line prompts
- **sorted-btree**: Efficient binary tree implementation for order book management

## Error Handling

The application includes robust error handling:

- **Connection Failures**: Automatic reconnection on WebSocket disconnection
- **Sequence Mismatches**: Automatic snapshot requests when updates are out of sequence
- **WebSocket Errors**: Graceful error handling with connection retry logic

## Architecture

```
┌─────────────────┐    WebSocket    ┌──────────────────┐
│   Foxbit API    │ ──────────────► │   Local Manager  │
│                 │                 │                  │
│  - Snapshots    │                 │  - B-Tree (Asks) │
│  - Updates      │                 │  - B-Tree (Bids) │
│  - Validation   │                 │  - HTTP Server   │
└─────────────────┘                 └──────────────────┘
                                              │
                                              │ HTTP
                                              ▼
                                    ┌─────────────────┐
                                    │   Client Apps   │
                                    │                 │
                                    │ GET /orderbook  │
                                    └─────────────────┘
```

## Use Cases

This local order book manager is useful for:

- **Trading Applications**: Maintaining low-latency access to order book data
- **Market Analysis**: Real-time monitoring of market depth and liquidity
- **Algorithm Development**: Testing trading strategies with live data
- **Data Analytics**: Historical analysis and pattern recognition
- **Arbitrage Detection**: Monitoring price differences across markets

## Contributing

This project is part of the [Foxbit API Samples](https://github.com/foxbit-group/foxbit-api-samples) repository. For contributions and issues, please refer to the main repository.

## Documentation

For more information about the Foxbit API:
- [Foxbit API Documentation](https://docs.foxbit.com.br/)
- [WebSocket v3 API Reference](https://docs.foxbit.com.br/websocket/v3)

## License

This project is licensed under the ISC License - see the [LICENSE.md](../../../LICENSE.md) file for details.

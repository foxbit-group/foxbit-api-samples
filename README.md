# Foxbit API Samples

Welcome to the "Foxbit API Samples" repository! This collection serves as a comprehensive resource for developers looking to integrate with Foxbit, one of the leading cryptocurrency exchanges. Whether you're building applications for trading, analysis, or automation, our examples will help you get started with the [Foxbit API](https://docs.foxbit.com.br/).

## About Foxbit API

The Foxbit API provides a powerful yet straightforward way for developers to interact with the Foxbit exchange platform. Offering both public and private endpoints, the API allows for accessing market data, managing orders, and automating trading strategies. For detailed documentation, please visit [Foxbit API Documentation](https://docs.foxbit.com.br/).

## Repository Contents

This repository contains sample code in various programming languages, demonstrating how to perform common tasks using the Foxbit API. Examples include:

- Fetching market data
- Placing and managing orders
- Account authentication and management
- Real-time market updates via WebSocket

### Currently Implemented Examples

- [REST v3](https://github.com/foxbit-group/foxbit-api-samples/tree/main/rest-v3)
    - [JavaScript](https://github.com/foxbit-group/foxbit-api-samples/tree/main/rest-v3/javascript)
    - [TypeScript](https://github.com/foxbit-group/foxbit-api-samples/tree/main/rest-v3/typescript)
    - [GoLang](https://github.com/foxbit-group/foxbit-api-samples/tree/main/rest-v3/go)
    - [Ruby](https://github.com/foxbit-group/foxbit-api-samples/tree/main/rest-v3/ruby)
- [WebSocket v2](https://github.com/foxbit-group/foxbit-api-samples/tree/main/websocket-v2)
    - [JavaScript](https://github.com/foxbit-group/foxbit-api-samples/tree/main/websocket-v2/javascript)

## Getting Started

To get started with the Foxbit API samples, follow these steps:

1. Clone this repository to your local machine.
2. Choose the language-specific folder for your project.
3. Install any necessary dependencies as described in the language-specific README files.
4. Explore the examples, which are commented for easy understanding.
5. Obtain your API key and secret from the Foxbit platform. Navigate to your account [API settings](https://app.foxbit.com.br/profile/api-key) on the Foxbit website to generate these credentials. Once obtained, export them as environment variables on your system using the following commands:

```bash
export FOXBIT_API_KEY=your_api_key_here
export FOXBIT_API_SECRET=your_api_secret_here
```

Make sure to replace `your_api_key_here` and `your_api_secret_here` with the actual values provided by Foxbit.

## Support

> If you encounter any issues while running the examples, ensure all dependencies are properly installed and the environment variables are correctly configured. For more information on the Foxbit API and its functionalities, refer to the [official Foxbit API documentation](https://docs.foxbit.com.br/).

## Disclaimer

> The samples in this repository are provided "as is" for educational purposes only. Please review the code and understand the implications before using it in a production environment.

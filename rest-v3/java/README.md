# Foxbit API REST v3 Java Examples

Here is the Java examples for the Foxbit API REST v3. This section provides a series of scripts to help you understand how to interact with the Foxbit API using Java. These examples cover a range of functionalities from fetching market data to placing orders and managing your account.

## Prerequisites

Before you begin, ensure you have the following prerequisites installed on your system:

- Java: These examples are written for Java, ensure you have the latest .NET SDK installed.
- Maven: Maven is a build automation tool used primarily for Java projects.

## Getting Started

1. **Install Dependencies**: Navigate to the java examples directory in your terminal and install the necessary dependencies.

```bash
mvn install
```

2. **Configure API Keys**: You must read the [main README file located at the root of the project](https://github.com/foxbit-group/foxbit-api-samples?tab=readme-ov-file#getting-started) for general information on setting up your environment, including configuring your API keys as environment variables.
3. **Running the Examples**: To run the example, navigate to the project directory in the terminal and execute the following command:

```bash
mvn exec:java -Dexec.mainClass="br.com.foxbit.samples.FoxbitApiSamples"
```

## Additional Notes

These examples are meant to serve as a starting point. They demonstrate basic API interactions. It's recommended to review and test the code thoroughly before using it in a production environment.
For detailed API documentation, refer to the [Foxbit API Documentation](https://docs.foxbit.com.br/rest/v3/).

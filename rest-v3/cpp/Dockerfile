FROM debian:13.2 AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
        g++ \
        libcurl4-openssl-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Pinned nlohmann/json single-header release.
ADD https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp ./json.hpp

COPY main.cpp .

RUN g++ -std=c++17 -O2 -Wall -Wextra -o foxbit-example main.cpp -lcurl -lssl -lcrypto

FROM debian:13.2-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libcurl4t64 \
        libssl3t64 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /src/foxbit-example .

CMD ["./foxbit-example"]

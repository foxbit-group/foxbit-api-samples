FROM debian:bookworm AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        ca-certificates \
        libcurl4-openssl-dev \
        libssl-dev \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /src

RUN curl -sSL -o json.hpp \
    https://raw.githubusercontent.com/nlohmann/json/v3.11.2/single_include/nlohmann/json.hpp

COPY examples.cpp .

RUN g++ examples.cpp -o examples \
        -std=c++17 -O2 -s -lcurl -lssl -lcrypto

FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libcurl4 \
        libssl3 \
        ca-certificates \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /src/examples .

ENTRYPOINT ["./examples"]

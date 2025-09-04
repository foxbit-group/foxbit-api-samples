FROM swift:6.1.0-focal AS builder

WORKDIR /src

RUN rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb \
 && mkdir -p /var/lib/apt/lists/partial

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libssl-dev \
      libcurl4-openssl-dev \
      pkg-config \
      build-essential \
      cmake \
      git \
    && rm -rf /var/lib/apt/lists/*

ENV PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig

COPY Package.swift ./
RUN swift package resolve

COPY . .
RUN swift build -c release

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive TZ=UTC

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libcurl4 \
      libssl3 \
      tzdata \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /src/.build/x86_64-unknown-linux-gnu/release/FoxbitExamples .
COPY --from=builder /usr/lib/swift/linux/lib*.so* /usr/lib/
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

RUN chmod +x ./FoxbitExamples

ENTRYPOINT ["./FoxbitExamples"]

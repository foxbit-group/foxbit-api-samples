# Build stage: compile a release binary with the full Swift toolchain.
FROM swift:6.2.4-noble AS build
WORKDIR /app

# Resolve pinned dependencies first so Docker caches this layer.
COPY Package.swift Package.resolved ./
RUN swift package resolve

COPY Sources ./Sources
RUN swift build -c release \
 && cp "$(swift build -c release --show-bin-path)/FoxbitExample" /app/FoxbitExample

# Runtime stage: slim image with only the Swift runtime libraries.
FROM swift:6.2.4-noble-slim
WORKDIR /app
COPY --from=build /app/FoxbitExample .
ENTRYPOINT ["./FoxbitExample"]

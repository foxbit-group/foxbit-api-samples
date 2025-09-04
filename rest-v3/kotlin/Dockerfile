# ---------- build ----------
FROM gradle:8-jdk17-alpine AS build

WORKDIR /app

COPY . .

RUN gradle installDist --no-daemon

# ---------- runtime ----------
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

COPY --from=build /app/build/install/foxbit-kotlin-examples /app

ENTRYPOINT ["/app/bin/foxbit-kotlin-examples"]

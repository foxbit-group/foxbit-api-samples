# ---------- Build stage ----------
FROM gradle:8.14.3-jdk21 AS build

WORKDIR /app

COPY settings.gradle.kts build.gradle.kts ./
COPY src ./src

RUN gradle --no-daemon installDist

# ---------- Runtime stage ----------
FROM eclipse-temurin:21.0.11_10-jre-alpine-3.23

WORKDIR /app

COPY --from=build /app/build/install/foxbit-rest-v3-kotlin ./

ENTRYPOINT ["/app/bin/foxbit-rest-v3-kotlin"]

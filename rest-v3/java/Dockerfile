# Build stage: compile and package a self-contained jar.
FROM maven:3.9.16-eclipse-temurin-21-noble AS build
WORKDIR /app
COPY pom.xml .
RUN mvn --batch-mode --quiet dependency:go-offline
COPY src ./src
RUN mvn --batch-mode --quiet package

# Runtime stage: slim JRE-only image.
FROM eclipse-temurin:21.0.11_10-jre-alpine-3.23
WORKDIR /app
COPY --from=build /app/target/foxbit-sample.jar ./foxbit-sample.jar
ENTRYPOINT ["java", "-jar", "foxbit-sample.jar"]

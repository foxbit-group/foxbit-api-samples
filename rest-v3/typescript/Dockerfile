# Build stage: install dev dependencies and compile TypeScript to JavaScript.
FROM node:22.22.0-alpine3.23 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json examples.ts ./
RUN npm run build

# Runtime stage: run the compiled JavaScript. The example has zero runtime
# dependencies (native fetch + node:crypto), so only the built output is copied.
FROM node:22.22.0-alpine3.23
WORKDIR /app
# package.json carries "type": "module", which the emitted ESM output needs.
COPY package.json ./
COPY --from=build /app/dist ./dist
CMD ["node", "dist/examples.js"]

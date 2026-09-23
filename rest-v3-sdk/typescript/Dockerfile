# Build stage: install all dependencies and compile TypeScript to JavaScript.
FROM node:22.22.0-alpine3.23 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY index.ts ./
RUN npm run build

# Runtime stage: install only production dependencies and run the compiled app.
FROM node:22.22.0-alpine3.23 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]

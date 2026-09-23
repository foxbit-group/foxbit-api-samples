# Pinned to a full, existing multi-arch tag (do not use `latest`).
FROM node:24.18.0-alpine3.24

WORKDIR /app

# Install dependencies from the exact lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY examples.js ./

CMD ["node", "examples.js"]

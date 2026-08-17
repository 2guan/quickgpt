# Multi-stage build for QuickGPT
FROM node:22-slim AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

RUN npm install

# Copy source codes
COPY tsconfig.json ./
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Build frontend SPA and backend API
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3200
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

# Install production dependencies only
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm install --omit=dev --workspace=apps/api

# Copy compiled distribution artifacts
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Create persistent data volume directory
RUN mkdir -p /data/uploads

VOLUME ["/data"]

EXPOSE 3200

CMD ["node", "apps/api/dist/index.js"]

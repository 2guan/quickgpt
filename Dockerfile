# Stage 1: Build & Dependencies (runs natively on the fast host platform without slow QEMU emulation)
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

WORKDIR /app

# Copy dependency manifests first to leverage Docker layer caching
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Clean install dependencies at native CPU speed
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Build frontend SPA and backend API distributions
RUN npm run build

# Prune devDependencies to keep only lean production node_modules
RUN npm prune --omit=dev && npm cache clean --force

# Stage 2: Ultra-lean Production Runtime (Node.js 24)
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3200
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

# 1. Copy stable production dependencies layer (cached across builds unless dependencies change)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package*.json ./apps/api/

# 2. Copy compiled application distributions (lightweight ~1MB layer for fast incremental pull)
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Create persistent data volume directory
RUN mkdir -p /data/uploads

VOLUME ["/data"]

EXPOSE 3200

CMD ["node", "apps/api/dist/index.js"]

# Multi-stage production Dockerfile for SyncMeet AI

# ------------------------------------------------------------------------------
# Stage 1: Build client frontend assets
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy source code and build config
COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src ./src
COPY public ./public

# Build Vite client production bundle
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production runtime image
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy server code
COPY server ./server

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Create and switch to non-root node user
USER node

EXPOSE 5000

# Container healthcheck querying production health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 5000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/server.js"]

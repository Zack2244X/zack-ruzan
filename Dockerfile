# ============================================
#   Dockerfile — منصة الاختبارات التفاعلية
# ============================================

# === Build stage: Tailwind CSS ===
FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json ./
COPY tailwind.config.js ./
RUN npm install --omit=dev 2>/dev/null; npm install -D tailwindcss@3
COPY client/ ./client/
RUN npx tailwindcss -i client/css/tailwind-input.css -o client/css/tailwind.css --minify

# === Production stage ===
FROM node:20-alpine AS base

# Security: don't run as root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy package files first for better caching
COPY server/package*.json ./server/

# Install production dependencies only
RUN cd server && npm ci --omit=dev

# Copy application code
COPY server/ ./server/
COPY client/ ./client/

# Copy built Tailwind CSS from builder
COPY --from=builder /build/client/css/tailwind.css ./client/css/tailwind.css

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Environment defaults
ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:10000/api/health || exit 1

CMD ["node", "server/index.js"]

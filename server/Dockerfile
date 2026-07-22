# GEWS Aggregator — Node.js 22
FROM node:22-alpine

WORKDIR /app

# Dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Non-root user for security
RUN addgroup -S gews && adduser -S gews -G gews
USER gews

EXPOSE 8765

# start-period bumped 10s->60s: /health now checks per-critical-source
# staleness (EMSC/USGS/AFAD/Kandilli/GEOFON), not just "process is up" — the
# app's own internal grace window (index.js STARTUP_GRACE_MS) already covers
# this, but Docker's start-period should agree so a slow cold start (first
# poll cycles + EMSC connect+first-pong) never counts as a failed attempt.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8765/health 2>/dev/null || exit 1

CMD ["node", "src/index.js"]

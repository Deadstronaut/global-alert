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

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8765/health 2>/dev/null || exit 1

CMD ["node", "src/index.js"]

FROM oven/bun:1.2.18-slim

WORKDIR /app

# Copy all necessary files first
COPY package.json bun.lock tsconfig.json ./
COPY src/ ./src/

# Install dependencies (this will also run prepare script if it exists)
RUN bun install --production

# Create data directory
RUN mkdir -p /app/data && \
    chown -R bun:bun /app/data

# Switch to non-root user (bun user already exists in base image)
USER bun

# Environment
ENV NODE_ENV=production
ENV MCP_CLIPBOARD_DATA_DIR=/app/data

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --version || exit 1

# Run the server directly from TypeScript
CMD ["bun", "run", "src/server.ts"]
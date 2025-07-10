# Multi-stage build for MCP Clipboard Server with Bun runtime
# Uses the latest Bun 1.2.18+ for optimal performance

# Stage 1: Dependencies
FROM oven/bun:1.2.18-slim AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --production

# Stage 2: Build
FROM oven/bun:1.2.18-slim AS builder
WORKDIR /app

# Copy source and dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN bun run build

# Stage 3: Runtime
FROM oven/bun:1.2.18-slim AS runtime
WORKDIR /app

# Use existing bun user from base image

# Copy built application and dependencies
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/dist ./dist
COPY --from=builder --chown=bun:bun /app/src ./src
COPY --chown=bun:bun package.json ./

# Create data directory for persistent storage
RUN mkdir -p /app/data && chown -R bun:bun /app/data

# Switch to non-root user
USER bun

# Set environment variables
ENV NODE_ENV=production
ENV MCP_CLIPBOARD_DATA_DIR=/app/data

# Expose the standard MCP port (though MCP typically uses stdio)
EXPOSE 3000

# Health check for container monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --version || exit 1

# Default command runs the MCP server
CMD ["bun", "run", "src/server.ts"]

# Labels for metadata
LABEL maintainer="Erik Balfe <erik.balfe@protonmail.com>"
LABEL description="MCP Clipboard Server - A Model Context Protocol server for clipboard management"
LABEL version="1.0.2"
LABEL org.opencontainers.image.title="MCP Clipboard Server"
LABEL org.opencontainers.image.description="Clipboard management server using the Model Context Protocol with Bun runtime"
LABEL org.opencontainers.image.url="https://github.com/erik-balfe/mcp-clipboard"
LABEL org.opencontainers.image.source="https://github.com/erik-balfe/mcp-clipboard"
LABEL org.opencontainers.image.vendor="Erik Balfe"
LABEL org.opencontainers.image.licenses="MIT"
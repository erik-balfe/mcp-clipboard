# MCP Clipboard Server - Docker Installation

This guide explains how to run the MCP Clipboard Server using Docker with Bun runtime.

## 🐳 Why Docker?

- **Environment Independence**: Works regardless of your local Node.js/Bun installation
- **Consistent Performance**: Uses optimized Bun 1.2.18+ runtime
- **Easy Updates**: Pull new image versions without dependency conflicts
- **Isolation**: Server runs in a secure, isolated container
- **Cross-Platform**: Works on Linux, macOS, and Windows

## 📋 Prerequisites

- Docker installed and running
- Docker Compose (recommended)

## 🚀 Quick Start

### Option 1: Using Docker Compose (Recommended)

1. **Clone or download the repository**:
```bash
git clone https://github.com/erik-balfe/mcp-clipboard.git
cd mcp-clipboard
```

2. **Start the server**:
```bash
docker-compose up -d
```

3. **Configure your MCP client**:
```json
{
  "mcpServers": {
    "clipboard": {
      "command": "bun",
      "args": ["./docker-mcp-wrapper.js"]
    }
  }
}
```

### Option 2: Using Docker directly

1. **Build the image**:
```bash
docker build -t mcp-clipboard:latest .
```

2. **Run the container**:
```bash
docker run -d \
  --name mcp-clipboard-server \
  --restart unless-stopped \
  -v $(pwd)/data:/app/data \
  mcp-clipboard:latest
```

3. **Configure your MCP client**:
```json
{
  "mcpServers": {
    "clipboard": {
      "command": "docker",
      "args": ["exec", "-i", "mcp-clipboard-server", "bun", "run", "src/server.ts"]
    }
  }
}
```

### Option 3: Using Pre-built Image (Coming Soon)

```bash
# Pull from registry (when published)
docker pull ghcr.io/erik-balfe/mcp-clipboard:latest

# Run with docker-compose
curl -o docker-compose.yml https://raw.githubusercontent.com/erik-balfe/mcp-clipboard/main/docker-compose.yml
docker-compose up -d
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_CLIPBOARD_DATA_DIR` | `/app/data` | Directory for database and cache |
| `NODE_ENV` | `production` | Runtime environment |

### Volume Mounts

- `/app/data` - Persistent storage for SQLite database and file cache
- `/app/cache` - (Optional) Cache directory

### Resource Limits

Default limits in docker-compose.yml:
- **Memory**: 512MB limit, 128MB reservation
- **CPU**: 0.5 cores limit, 0.1 cores reservation

## 🎛️ Management Commands

### Start/Stop Services
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart clipboard service
docker-compose restart mcp-clipboard

# View logs
docker-compose logs -f mcp-clipboard
```

### Container Management
```bash
# Check container status
docker ps --filter name=mcp-clipboard

# View container logs
docker logs mcp-clipboard-server

# Enter container for debugging
docker exec -it mcp-clipboard-server /bin/sh

# Check resource usage
docker stats mcp-clipboard-server
```

### Data Management
```bash
# Backup data
tar -czf clipboard-backup-$(date +%Y%m%d).tar.gz data/

# Restore data
tar -xzf clipboard-backup-YYYYMMDD.tar.gz

# Clear cache (keep database)
rm -rf data/cache/*
```

## 🔍 Troubleshooting

### Container Won't Start
```bash
# Check Docker daemon
docker --version
docker info

# Check image
docker images | grep mcp-clipboard

# Rebuild image
docker-compose build --no-cache mcp-clipboard
```

### Permission Issues
```bash
# Fix data directory permissions
sudo chown -R 1001:1001 data/

# Check container user
docker exec mcp-clipboard-server id
```

### Memory Issues
```bash
# Monitor memory usage
docker stats mcp-clipboard-server

# Increase memory limit in docker-compose.yml
# Change: memory: 1024M
```

### Network Connectivity
```bash
# Check container network
docker network ls
docker network inspect mcp-clipboard_mcp-network

# Test container connectivity
docker exec mcp-clipboard-server bun --version
```

## 🎯 MCP Client Configuration Examples

### Claude Desktop
```json
{
  "mcpServers": {
    "clipboard": {
      "command": "bun",
      "args": ["./docker-mcp-wrapper.js"],
      "env": {
        "MCP_CLIPBOARD_DATA_DIR": "./data"
      }
    }
  }
}
```

### Claude Code
```json
{
  "mcpServers": {
    "clipboard": {
      "command": "bun",
      "args": ["./docker-mcp-wrapper.js"]
    }
  }
}
```

### Zed IDE
```json
{
  "assistant": {
    "version": "2",
    "provider": {
      "name": "anthropic",
      "default_model": "claude-3-5-sonnet-20241022",
      "low_speed_timeout_in_seconds": 60
    }
  },
  "context_servers": {
    "mcp-clipboard": {
      "command": "bun",
      "args": ["./docker-mcp-wrapper.js"]
    }
  }
}
```

## 🔒 Security Considerations

- Container runs as non-root user (UID 1001)
- Read-only filesystem where possible
- No new privileges allowed
- Resource limits enforced
- Data directory properly isolated

## 📊 Monitoring (Optional)

Enable Watchtower for automatic updates:
```bash
docker-compose --profile monitoring up -d
```

This adds automatic container updates when new images are published.

## ⚡ Performance Tips

1. **Use SSD storage** for the data volume
2. **Allocate sufficient memory** (512MB+ recommended)
3. **Monitor container logs** for performance issues
4. **Regular backups** of the data directory
5. **Prune unused Docker objects** periodically:
   ```bash
   docker system prune -a
   ```

## 🆙 Updates

### Manual Update
```bash
# Pull latest image
docker-compose pull mcp-clipboard

# Restart with new image
docker-compose up -d mcp-clipboard
```

### Automatic Updates (with Watchtower)
```bash
# Enable monitoring profile
docker-compose --profile monitoring up -d

# Watchtower will check for updates hourly
```

## 🚨 Emergency Recovery

### Complete Reset
```bash
# Stop all services
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Remove images
docker rmi mcp-clipboard:latest

# Start fresh
docker-compose up -d --build
```

### Data Recovery
```bash
# Restore from backup
tar -xzf clipboard-backup-YYYYMMDD.tar.gz

# Fix permissions
sudo chown -R 1001:1001 data/

# Restart container
docker-compose restart mcp-clipboard
```

## 🔗 Related Documentation

- [Main README](./README.md) - General installation and usage
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Bun Docker Guide](https://bun.sh/guides/ecosystem/docker)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
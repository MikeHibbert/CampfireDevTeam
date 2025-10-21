# CampfireValley Backend Deployment Guide

This guide provides comprehensive instructions for deploying the CampfireValley backend service using Docker and Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Options](#deployment-options)
- [Service Management](#service-management)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

## Prerequisites

### Required Software

1. **Docker Desktop** (version 4.0 or higher)
   - Download from: https://www.docker.com/products/docker-desktop
   - Ensure Docker is running before deployment

2. **Docker Compose** (usually included with Docker Desktop)
   - Verify installation: `docker-compose --version`

3. **Ollama Server** (for AI model processing)
   - Download from: https://ollama.ai
   - Must be running on host system at `localhost:11434`
   - Recommended models: `codellama:7b`, `llama2:7b`

### System Requirements

- **Memory**: Minimum 4GB RAM, recommended 8GB+
- **Storage**: At least 2GB free space for containers and data
- **Network**: Ports 8080 (MCP server) and 6379 (Redis) must be available

## Quick Start

### Linux/macOS

```bash
# Make deployment script executable
chmod +x deploy.sh

# Deploy CampfireValley backend
./deploy.sh

# Check status
./deploy.sh status
```

### Windows (PowerShell)

```powershell
# Deploy CampfireValley backend
.\deploy.ps1

# Check status
.\deploy.ps1 status
```

### Manual Deployment

```bash
# Create necessary directories
mkdir -p party_box logs

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f
```

## Configuration

### Environment Variables

The deployment uses a `.env` file for configuration. Key variables include:

```env
# Ollama Configuration
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=codellama:7b
OLLAMA_TIMEOUT=30

# Redis Configuration
REDIS_URL=redis://redis:6379

# Storage Configuration
PARTY_BOX_PATH=/app/party_box
MAX_FILE_SIZE=10485760

# Logging
LOG_LEVEL=INFO

# Security
ENABLE_SECURITY_VALIDATION=true
```

### Manifest Configuration

The backend is now a **generic configuration-driven engine** that loads campfires from manifest files in the `manifests/` directory:

- **Dynamic Loading**: Campfires are loaded from YAML/JSON manifest files at startup
- **Multi-Campfire Support**: Multiple campfires can be configured and switched at runtime
- **Flexible Camper Configuration**: Campers are defined through configuration rather than hardcoded
- **Workflow Definitions**: Custom collaboration sequences for different task types
- **Security Settings**: Configurable validation rules and dangerous pattern detection
- **Performance Tuning**: Per-campfire timeouts, concurrency limits, and caching

#### Default Campfires

The system includes two example campfires:

1. **DevTeam** (`manifests/devteam.yaml`): Full-featured development team with 8 specialized campers
2. **SimpleAssistant** (`manifests/simple-assistant.yaml`): Minimal assistant with 3 basic campers

#### Adding Custom Campfires

Create new manifest files in the `manifests/` directory and reload using:
```bash
curl -X POST http://localhost:8080/campfires/reload
```

## Deployment Options

### Development Deployment

For development and testing:

```bash
# Use development configuration
export LOG_LEVEL=DEBUG
export ENABLE_FALLBACK_RESPONSES=true

# Deploy with verbose logging
./deploy.sh
```

### Production Deployment

For production environments:

```bash
# Use production configuration
export LOG_LEVEL=INFO
export ENABLE_SECURITY_VALIDATION=true
export CACHE_RESPONSES=true

# Deploy with optimized settings
./deploy.sh
```

### Custom Port Configuration

To use different ports:

```bash
# Modify docker-compose.yml or use environment variables
export MCP_PORT=8081
export REDIS_PORT=6380

# Update port mappings in docker-compose.yml
ports:
  - "${MCP_PORT:-8080}:8080"
```

## Service Management

### Starting Services

```bash
# Linux/macOS
./deploy.sh deploy

# Windows
.\deploy.ps1 deploy

# Manual
docker-compose up -d
```

### Stopping Services

```bash
# Linux/macOS
./deploy.sh stop

# Windows
.\deploy.ps1 stop

# Manual
docker-compose down
```

### Restarting Services

```bash
# Linux/macOS
./deploy.sh restart

# Windows
.\deploy.ps1 restart

# Manual
docker-compose restart
```

### Viewing Logs

```bash
# Linux/macOS
./deploy.sh logs

# Windows
.\deploy.ps1 logs

# Manual
docker-compose logs -f

# Specific service logs
docker-compose logs -f campfire-backend
docker-compose logs -f redis
```

### Service Status

```bash
# Linux/macOS
./deploy.sh status

# Windows
.\deploy.ps1 status

# Manual
docker-compose ps
```

## Service Endpoints

Once deployed, the following endpoints are available:

- **MCP Server**: `http://localhost:8080/mcp`
- **Health Check**: `http://localhost:8080/health`
- **List Campfires**: `http://localhost:8080/campfires`
- **Campfire Details**: `http://localhost:8080/campfires/{name}`
- **Activate Campfire**: `POST http://localhost:8080/campfires/{name}/activate`
- **Reload Campfires**: `POST http://localhost:8080/campfires/reload`
- **Redis**: `localhost:6379`

### Campfire Management

#### List Available Campfires
```bash
curl http://localhost:8080/campfires
```

#### Get Campfire Details
```bash
curl http://localhost:8080/campfires/DevTeam
curl http://localhost:8080/campfires/SimpleAssistant
```

#### Switch Active Campfire
```bash
# Activate DevTeam campfire
curl -X POST http://localhost:8080/campfires/DevTeam/activate

# Activate SimpleAssistant campfire
curl -X POST http://localhost:8080/campfires/SimpleAssistant/activate
```

#### Reload Campfires (after adding new manifest files)
```bash
curl -X POST http://localhost:8080/campfires/reload
```

### Health Check

Test the deployment:

```bash
# Check MCP server health
curl http://localhost:8080/health

# Check Redis connectivity
docker-compose exec redis redis-cli ping
```

## Troubleshooting

### Common Issues

#### 1. Docker Not Running

**Error**: `Cannot connect to the Docker daemon`

**Solution**:
```bash
# Start Docker Desktop
# On Linux: sudo systemctl start docker
# On macOS/Windows: Start Docker Desktop application
```

#### 2. Port Already in Use

**Error**: `Port 8080 is already allocated`

**Solution**:
```bash
# Find process using port
lsof -i :8080  # Linux/macOS
netstat -ano | findstr :8080  # Windows

# Kill process or change port in docker-compose.yml
```

#### 3. Ollama Not Accessible

**Error**: `Ollama server not accessible`

**Solution**:
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve

# Pull required models
ollama pull codellama:7b
ollama pull llama2:7b
```

#### 4. Permission Denied (Linux/macOS)

**Error**: `Permission denied: ./deploy.sh`

**Solution**:
```bash
# Make script executable
chmod +x deploy.sh
```

#### 5. Redis Connection Failed

**Error**: `Redis connection failed`

**Solution**:
```bash
# Check Redis container
docker-compose logs redis

# Restart Redis
docker-compose restart redis

# Check Redis connectivity
docker-compose exec redis redis-cli ping
```

### Log Analysis

#### Backend Logs

```bash
# View backend logs
docker-compose logs campfire-backend

# Follow logs in real-time
docker-compose logs -f campfire-backend

# Filter by log level
docker-compose logs campfire-backend | grep ERROR
```

#### Redis Logs

```bash
# View Redis logs
docker-compose logs redis

# Check Redis configuration
docker-compose exec redis redis-cli CONFIG GET "*"
```

### Performance Issues

#### High Memory Usage

```bash
# Check container resource usage
docker stats

# Limit container memory in docker-compose.yml
services:
  campfire-backend:
    mem_limit: 2g
```

#### Slow Response Times

1. Check Ollama model performance
2. Increase timeout values in manifest.yaml
3. Enable response caching
4. Reduce concurrent camper limits

## Advanced Configuration

### Custom Camper Configuration

Modify `manifest.yaml` to customize camper behavior:

```yaml
campers:
  - role: "CustomCamper"
    description: "Custom specialized camper"
    promptTemplate: "Custom prompt for {task} on {os}"
    confidenceThreshold: 0.8
    specializations:
      - "custom_functionality"
```

### Security Hardening

1. **Enable Security Validation**:
   ```yaml
   security:
     enableSecurityValidation: true
     blockDangerousCommands: true
     validateCodeSafety: true
   ```

2. **Custom Dangerous Patterns**:
   ```yaml
   security:
     dangerousPatterns:
       - "custom_dangerous_pattern"
       - "another_pattern"
   ```

3. **File Type Restrictions**:
   ```yaml
   storage:
     allowedFileTypes:
       - ".py"
       - ".js"
       - ".custom"
   ```

### Performance Tuning

1. **Concurrency Settings**:
   ```yaml
   performance:
     maxConcurrentCampers: 5
     maxConcurrentTasks: 10
   ```

2. **Timeout Configuration**:
   ```yaml
   performance:
     responseTimeoutMs: 60000
     retryAttempts: 5
   ```

3. **Caching**:
   ```yaml
   performance:
     cacheResponses: true
     cacheExpirationHours: 24
   ```

### Monitoring and Metrics

1. **Enable Metrics**:
   ```yaml
   performance:
     enableMetrics: true
   ```

2. **Custom Logging**:
   ```yaml
   logging:
     level: "DEBUG"
     enableCamperLogs: true
     enableWorkflowLogs: true
   ```

### Backup and Recovery

#### Backup Party Box Data

```bash
# Create backup
tar -czf party_box_backup_$(date +%Y%m%d).tar.gz party_box/

# Restore backup
tar -xzf party_box_backup_YYYYMMDD.tar.gz
```

#### Backup Redis Data

```bash
# Create Redis backup
docker-compose exec redis redis-cli BGSAVE

# Copy backup file
docker cp campfire-redis:/data/dump.rdb ./redis_backup.rdb
```

## Integration with VS Code Plugin

The backend is designed to work with the CampfireDevAgent VS Code plugin:

1. **Plugin Configuration**:
   ```json
   {
     "campfire.mcpServer": "http://localhost:8080/mcp",
     "campfire.partyBoxPath": "./party_box"
   }
   ```

2. **Connection Testing**:
   - Use VS Code command: "Campfire: Generate Code"
   - Check backend logs for incoming requests
   - Verify Party Box file creation

## Support and Maintenance

### Regular Maintenance

1. **Update Images**:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

2. **Clean Up**:
   ```bash
   # Remove unused containers and images
   docker system prune -f
   
   # Complete cleanup (WARNING: removes all data)
   ./deploy.sh clean
   ```

3. **Log Rotation**:
   ```bash
   # Rotate logs (configure in docker-compose.yml)
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"
   ```

### Getting Help

- Check logs: `docker-compose logs -f`
- Verify configuration: Review `manifest.yaml` and `.env`
- Test connectivity: Use health check endpoints
- Community support: Check project documentation

---

**Note**: This deployment guide is based on requirements 5.1, 5.2, 9.1, and 9.2 for CampfireValley backend deployment with Docker and specialized camper configuration.
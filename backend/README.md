# CampfireValley Backend

Docker-based backend service for the CampfireValley development team collaboration platform.

## Quick Start

1. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

2. Build and run with Docker Compose:
   ```bash
   docker-compose up --build
   ```

3. The MCP server will be available at `http://localhost:8080`

## Services

- **campfire-backend**: Main MCP server (port 8080)
- **redis**: Redis cache and session storage (port 6379)

## Environment Variables

- `OLLAMA_URL`: URL for Ollama LLM service
- `REDIS_URL`: Redis connection string
- `PARTY_BOX_PATH`: Path to shared party box directory
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)

## Development

The `party_box` and `logs` directories are mounted as volumes for persistent data and debugging.
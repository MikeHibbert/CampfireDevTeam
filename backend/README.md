# CampfireValley Backend

Generic configuration-driven backend engine for CampfireValley that dynamically loads and configures campfires based on manifest files.

## Features

- **Generic Campfire Engine**: Configuration-driven system that loads any campfire from manifest files
- **Dynamic Camper Loading**: Automatically instantiates campers based on YAML/JSON configuration
- **Workflow-Based Processing**: Configurable collaboration sequences for different task types
- **Multi-Campfire Support**: Can host multiple campfires and switch between them at runtime
- **Security Validation**: Comprehensive auditor gating for code security and quality
- **Docker Deployment**: Easy deployment with Docker Desktop integration
- **Party Box Protocol**: Structured data exchange for file attachments and context sharing

## Quick Start

### Automated Deployment

**Linux/macOS:**
```bash
./deploy.sh
```

**Windows (PowerShell):**
```powershell
.\deploy.ps1
```

### Manual Deployment

1. **Prerequisites:**
   - Docker Desktop installed and running
   - Ollama server running at `localhost:11434`

2. **Deploy services:**
   ```bash
   # Create directories
   mkdir -p party_box logs
   
   # Start services
   docker-compose up -d
   
   # Check status
   docker-compose ps
   ```

3. **Verify deployment:**
   ```bash
   # Linux/macOS
   ./health-check.sh
   
   # Windows
   .\health-check.ps1
   ```

## Services

- **campfire-backend**: Main MCP server with DevTeam campfire (port 8080)
- **redis**: Redis cache and MCP brokering (port 6379)

### Service Endpoints

- **MCP Server**: `http://localhost:8080/mcp`
- **Health Check**: `http://localhost:8080/health`
- **List Campfires**: `http://localhost:8080/campfires`
- **Campfire Info**: `http://localhost:8080/campfires/{name}`
- **Activate Campfire**: `POST http://localhost:8080/campfires/{name}/activate`
- **Reload Campfires**: `POST http://localhost:8080/campfires/reload`
- **Redis**: `localhost:6379`

## Configuration

### Environment Variables

Key configuration options in `.env`:

```env
# Ollama Configuration
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=codellama:7b

# Redis Configuration
REDIS_URL=redis://redis:6379

# Storage Configuration
PARTY_BOX_PATH=/app/party_box
MAX_FILE_SIZE=10485760

# Security
ENABLE_SECURITY_VALIDATION=true

# Logging
LOG_LEVEL=INFO
```

### Manifest Configuration

The `manifest.yaml` file contains detailed configuration for:

- **Camper Specializations**: Prompt templates and confidence thresholds
- **Workflow Definitions**: Collaboration sequences for different tasks
- **Security Settings**: Dangerous pattern detection and validation rules
- **Performance Tuning**: Timeouts, concurrency limits, and resource management

## Generic Campfire Architecture

The backend is a generic engine that loads campfires from manifest files. By default, it includes a "DevTeam" campfire with eight specialized campers:

### Campers

1. **RequirementsGatherer**: Analyzes tasks and determines scope
2. **OSExpert**: Provides OS-specific recommendations and technology stack advice
3. **BackEndDev**: Generates backend/server-side code and APIs
4. **FrontEndDev**: Creates frontend/client-side code and user interfaces
5. **Tester**: Creates comprehensive test cases and testing strategies
6. **DevOps**: Provides deployment scripts and infrastructure configuration
7. **TerminalExpert**: Suggests OS-specific terminal commands for debugging and operations
8. **Auditor**: Performs code review, security analysis, and quality verification (acts as final gate)

### Workflows

- **generate_code**: Complete code generation with all campers and auditor gate
- **review_code**: Code review workflow focusing on quality and security
- **execute_command**: Terminal command generation and validation

## Service Management

### Starting Services

```bash
# Automated
./deploy.sh deploy

# Manual
docker-compose up -d
```

### Stopping Services

```bash
# Automated
./deploy.sh stop

# Manual
docker-compose down
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f campfire-backend
docker-compose logs -f redis
```

### Health Monitoring

```bash
# Linux/macOS
./health-check.sh

# Windows
.\health-check.ps1

# Manual health check
curl http://localhost:8080/health
```

## Development

### Directory Structure

```
backend/
├── party_box/          # Generic campfire engine and processing components
├── manifests/          # Campfire manifest files (mounted volume)
│   └── devteam.yaml   # DevTeam campfire configuration
├── logs/              # Application logs (mounted volume)
├── party_box/         # Party Box storage (mounted volume)
├── tests/             # Test suites
├── docker-compose.yml # Docker services configuration
├── Dockerfile         # Backend container definition
├── deploy.sh          # Linux/macOS deployment script
├── deploy.ps1         # Windows deployment script
├── health-check.sh    # Linux/macOS health check
├── health-check.ps1   # Windows health check
└── DEPLOYMENT.md      # Comprehensive deployment guide
```

### Adding New Campfires

To add a new campfire configuration:

1. **Create manifest file**: Add a new YAML file in the `manifests/` directory
2. **Define campers**: Configure specialized campers with their roles and capabilities
3. **Set workflows**: Define collaboration sequences for different task types
4. **Reload campfires**: Use the `/campfires/reload` endpoint or restart the service

Example manifest structure:
```yaml
apiVersion: campfire.valley/v1
kind: CampfireManifest
metadata:
  name: my-custom-campfire
spec:
  campfire:
    name: "MyCustom"
    type: "specialized"
  campers:
    - role: "CustomCamper"
      description: "Custom specialized camper"
      promptTemplate: "Custom prompt for {task} on {os}"
      specializations: ["custom_functionality"]
  workflows:
    generate_code:
      sequence: ["CustomCamper"]
```

### Testing

```bash
# Run all tests
python run_tests.py

# Run specific test suite
python -m pytest tests/test_devteam_campfire.py -v

# Test Docker integration
python -m pytest tests/test_docker_integration.py -v
```

### Integration with VS Code Plugin

The backend is designed to work with the CampfireDevAgent VS Code plugin:

1. **Plugin Configuration:**
   ```json
   {
     "campfire.mcpServer": "http://localhost:8080/mcp",
     "campfire.partyBoxPath": "./party_box"
   }
   ```

2. **Connection Testing:**
   - Use VS Code command: "Campfire: Generate Code"
   - Check backend logs for incoming requests
   - Verify Party Box file creation

## Troubleshooting

### Common Issues

1. **Docker not running**: Start Docker Desktop
2. **Port conflicts**: Check if ports 8080/6379 are available
3. **Ollama not accessible**: Ensure Ollama is running at `localhost:11434`
4. **Permission issues**: Make deployment scripts executable

### Getting Help

- Check service logs: `docker-compose logs -f`
- Run health check: `./health-check.sh` or `.\health-check.ps1`
- Review configuration: `manifest.yaml` and `.env`
- See comprehensive guide: [DEPLOYMENT.md](DEPLOYMENT.md)

## Requirements

Based on CampfireValley requirements:
- **5.1, 5.2**: DevTeam campfire with eight specialized campers
- **9.1, 9.2**: Docker deployment with Docker Desktop management
- **12.1-12.7**: Party Box processing through riverboat system
- **13.1-13.7**: Comprehensive error handling and security validation
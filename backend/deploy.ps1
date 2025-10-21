# CampfireValley Backend Deployment Script for Windows
# Based on requirements 9.1, 9.2 for Docker deployment

param(
    [Parameter(Position=0)]
    [ValidateSet("deploy", "stop", "restart", "logs", "status", "clean", "help")]
    [string]$Command = "deploy"
)

# Configuration
$ComposeFile = "docker-compose.yml"
$EnvFile = ".env"
$PartyBoxDir = "./party_box"
$LogsDir = "./logs"

# Colors for output
$Colors = @{
    Red = "Red"
    Green = "Green"
    Yellow = "Yellow"
    Blue = "Blue"
    White = "White"
}

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Colors.Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Colors.Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Colors.Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Colors.Red
}

function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Test-Prerequisites {
    Write-Status "Checking prerequisites..."
    
    if (-not (Test-CommandExists "docker")) {
        Write-Error "Docker is not installed. Please install Docker Desktop."
        exit 1
    }
    
    if (-not (Test-CommandExists "docker-compose")) {
        Write-Error "Docker Compose is not installed. Please install Docker Compose."
        exit 1
    }
    
    # Check if Docker is running
    try {
        docker info | Out-Null
    }
    catch {
        Write-Error "Docker is not running. Please start Docker Desktop."
        exit 1
    }
    
    Write-Success "Prerequisites check passed"
}

function New-Directories {
    Write-Status "Creating necessary directories..."
    
    if (-not (Test-Path $PartyBoxDir)) {
        New-Item -ItemType Directory -Path $PartyBoxDir -Force | Out-Null
    }
    
    if (-not (Test-Path $LogsDir)) {
        New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    }
    
    Write-Success "Directories created"
}

function New-EnvFile {
    if (-not (Test-Path $EnvFile)) {
        Write-Status "Creating environment file..."
        
        $envContent = @"
# CampfireValley Backend Environment Configuration
OLLAMA_URL=http://host.docker.internal:11434
REDIS_URL=redis://redis:6379
PARTY_BOX_PATH=/app/party_box
LOG_LEVEL=INFO
PYTHONPATH=/app

# Optional: Override default ports
# MCP_PORT=8080
# REDIS_PORT=6379

# Optional: Ollama configuration
# OLLAMA_MODEL=codellama:7b
# OLLAMA_TIMEOUT=30

# Optional: Security settings
# ENABLE_SECURITY_VALIDATION=true
# MAX_FILE_SIZE=10485760
"@
        
        $envContent | Out-File -FilePath $EnvFile -Encoding UTF8
        
        Write-Success "Environment file created: $EnvFile"
        Write-Warning "Please review and modify $EnvFile as needed"
    }
    else {
        Write-Status "Environment file already exists: $EnvFile"
    }
}

function Test-Ollama {
    Write-Status "Checking Ollama server availability..."
    
    # Extract Ollama URL from environment or use default
    $OllamaUrl = "http://localhost:11434"
    if (Test-Path $EnvFile) {
        $envContent = Get-Content $EnvFile
        $ollamaLine = $envContent | Where-Object { $_ -match "OLLAMA_URL=" }
        if ($ollamaLine) {
            $OllamaUrl = ($ollamaLine -split "=")[1] -replace "host.docker.internal", "localhost"
        }
    }
    
    try {
        $response = Invoke-RestMethod -Uri "$OllamaUrl/api/tags" -TimeoutSec 5
        Write-Success "Ollama server is accessible at $OllamaUrl"
    }
    catch {
        Write-Warning "Ollama server is not accessible at $OllamaUrl"
        Write-Warning "Please ensure Ollama is running on your host system"
        Write-Warning "You can install Ollama from: https://ollama.ai"
    }
}

function Start-Services {
    Write-Status "Building and starting CampfireValley services..."
    
    # Build the application
    docker-compose -f $ComposeFile build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build services"
        exit 1
    }
    
    # Start services
    docker-compose -f $ComposeFile up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to start services"
        exit 1
    }
    
    Write-Success "Services started successfully"
}

function Wait-ForServices {
    Write-Status "Waiting for services to be ready..."
    
    # Wait for Redis
    Write-Status "Waiting for Redis..."
    $timeout = 30
    while ($timeout -gt 0) {
        try {
            docker-compose -f $ComposeFile exec -T redis redis-cli ping | Out-Null
            Write-Success "Redis is ready"
            break
        }
        catch {
            Start-Sleep -Seconds 1
            $timeout--
        }
    }
    
    if ($timeout -eq 0) {
        Write-Error "Redis failed to start within 30 seconds"
        return $false
    }
    
    # Wait for MCP server
    Write-Status "Waiting for MCP server..."
    $timeout = 60
    while ($timeout -gt 0) {
        try {
            Invoke-RestMethod -Uri "http://localhost:8080/health" -TimeoutSec 2 | Out-Null
            Write-Success "MCP server is ready"
            break
        }
        catch {
            Start-Sleep -Seconds 2
            $timeout -= 2
        }
    }
    
    if ($timeout -eq 0) {
        Write-Warning "MCP server may not be fully ready yet"
        Write-Warning "Check logs with: docker-compose logs campfire-backend"
    }
    
    return $true
}

function Show-Status {
    Write-Status "Deployment Status:"
    Write-Host ""
    
    docker-compose -f $ComposeFile ps
    
    Write-Host ""
    Write-Status "Service URLs:"
    Write-Host "  MCP Server: http://localhost:8080/mcp"
    Write-Host "  Health Check: http://localhost:8080/health"
    Write-Host "  Redis: localhost:6379"
    Write-Host ""
    
    Write-Status "Useful Commands:"
    Write-Host "  View logs: docker-compose logs -f"
    Write-Host "  Stop services: docker-compose down"
    Write-Host "  Restart services: docker-compose restart"
    Write-Host "  Update services: .\deploy.ps1"
    Write-Host ""
}

function Invoke-Deploy {
    Write-Host ""
    Write-Status "Starting CampfireValley Backend deployment..."
    Write-Host ""
    
    Test-Prerequisites
    New-Directories
    New-EnvFile
    Test-Ollama
    Start-Services
    Wait-ForServices
    Show-Status
    
    Write-Success "🔥 CampfireValley Backend deployment completed!"
    Write-Status "The backend is now running and ready to accept connections from VS Code plugin"
}

function Stop-Services {
    Write-Status "Stopping CampfireValley services..."
    docker-compose -f $ComposeFile down
    Write-Success "Services stopped"
}

function Restart-Services {
    Write-Status "Restarting CampfireValley services..."
    docker-compose -f $ComposeFile restart
    Write-Success "Services restarted"
}

function Show-Logs {
    docker-compose -f $ComposeFile logs -f
}

function Show-ServiceStatus {
    docker-compose -f $ComposeFile ps
}

function Remove-All {
    Write-Warning "This will remove all containers, volumes, and images"
    $confirmation = Read-Host "Are you sure? (y/N)"
    if ($confirmation -eq "y" -or $confirmation -eq "Y") {
        docker-compose -f $ComposeFile down -v --rmi all
        Write-Success "Cleanup completed"
    }
}

function Show-Help {
    Write-Host "Usage: .\deploy.ps1 [command]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  deploy   - Deploy CampfireValley backend (default)"
    Write-Host "  stop     - Stop all services"
    Write-Host "  restart  - Restart all services"
    Write-Host "  logs     - Show service logs"
    Write-Host "  status   - Show service status"
    Write-Host "  clean    - Remove all containers and images"
    Write-Host "  help     - Show this help message"
}

# Main execution
Write-Host "🔥 CampfireValley Backend Deployment Script" -ForegroundColor $Colors.Yellow
Write-Host "==========================================" -ForegroundColor $Colors.Yellow

switch ($Command) {
    "deploy" { Invoke-Deploy }
    "stop" { Stop-Services }
    "restart" { Restart-Services }
    "logs" { Show-Logs }
    "status" { Show-ServiceStatus }
    "clean" { Remove-All }
    "help" { Show-Help }
    default {
        Write-Error "Unknown command: $Command"
        Write-Status "Use '.\deploy.ps1 help' for available commands"
        exit 1
    }
}
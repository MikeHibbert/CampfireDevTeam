# CampfireValley Backend Health Check Script for Windows
# Verifies all services are running correctly

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
    Write-Host "[CHECK] $Message" -ForegroundColor $Colors.Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor $Colors.Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor $Colors.Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor $Colors.Red
}

Write-Host "🔥 CampfireValley Backend Health Check" -ForegroundColor $Colors.Yellow
Write-Host "=====================================" -ForegroundColor $Colors.Yellow
Write-Host ""

# Check Docker services
Write-Status "Checking Docker services..."
try {
    $services = docker-compose ps
    if ($services -match "Up") {
        Write-Success "Docker services are running"
    }
    else {
        Write-Error "Docker services are not running"
        Write-Host "Run: docker-compose up -d"
        exit 1
    }
}
catch {
    Write-Error "Failed to check Docker services"
    Write-Host "Ensure Docker Desktop is running"
    exit 1
}

# Check MCP Server
Write-Status "Checking MCP Server..."
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/health" -TimeoutSec 5
    Write-Success "MCP Server is responding"
}
catch {
    Write-Error "MCP Server is not responding"
    Write-Host "Check logs: docker-compose logs campfire-backend"
}

# Check Redis
Write-Status "Checking Redis..."
try {
    $redisCheck = docker-compose exec -T redis redis-cli ping 2>$null
    if ($redisCheck -match "PONG") {
        Write-Success "Redis is responding"
    }
    else {
        Write-Error "Redis is not responding"
        Write-Host "Check logs: docker-compose logs redis"
    }
}
catch {
    Write-Error "Failed to check Redis"
    Write-Host "Check logs: docker-compose logs redis"
}

# Check Ollama connectivity
Write-Status "Checking Ollama connectivity..."
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
    Write-Success "Ollama server is accessible"
}
catch {
    Write-Warning "Ollama server is not accessible"
    Write-Host "Ensure Ollama is running: ollama serve"
}

# Check Party Box directory
Write-Status "Checking Party Box directory..."
if (Test-Path "./party_box") {
    Write-Success "Party Box directory exists"
}
else {
    Write-Warning "Party Box directory not found"
    Write-Host "Creating directory..."
    New-Item -ItemType Directory -Path "./party_box" -Force | Out-Null
}

# Check logs directory
Write-Status "Checking logs directory..."
if (Test-Path "./logs") {
    Write-Success "Logs directory exists"
}
else {
    Write-Warning "Logs directory not found"
    Write-Host "Creating directory..."
    New-Item -ItemType Directory -Path "./logs" -Force | Out-Null
}

# Test MCP endpoint
Write-Status "Testing MCP endpoint..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/mcp" -Method GET -TimeoutSec 5
    if ($response.StatusCode -eq 405 -or $response.StatusCode -eq 200) {
        Write-Success "MCP endpoint is accessible"
    }
    else {
        Write-Warning "MCP endpoint returned status: $($response.StatusCode)"
    }
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 405) {
        Write-Success "MCP endpoint is accessible (Method Not Allowed is expected)"
    }
    else {
        Write-Warning "MCP endpoint test failed with status: $statusCode"
    }
}

Write-Host ""
Write-Host "Health check completed!" -ForegroundColor $Colors.Green
Write-Host ""
Write-Host "Service URLs:"
Write-Host "  MCP Server: http://localhost:8080/mcp"
Write-Host "  Health Check: http://localhost:8080/health"
Write-Host "  Redis: localhost:6379"
Write-Host ""
Write-Host "Useful commands:"
Write-Host "  View logs: docker-compose logs -f"
Write-Host "  Restart: docker-compose restart"
Write-Host "  Stop: docker-compose down"
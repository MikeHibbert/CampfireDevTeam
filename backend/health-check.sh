#!/bin/bash

# CampfireValley Backend Health Check Script
# Verifies all services are running correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

echo "🔥 CampfireValley Backend Health Check"
echo "====================================="
echo ""

# Check Docker services
print_status "Checking Docker services..."
if docker-compose ps | grep -q "Up"; then
    print_success "Docker services are running"
else
    print_error "Docker services are not running"
    echo "Run: docker-compose up -d"
    exit 1
fi

# Check MCP Server
print_status "Checking MCP Server..."
if curl -s http://localhost:8080/health >/dev/null 2>&1; then
    print_success "MCP Server is responding"
else
    print_error "MCP Server is not responding"
    echo "Check logs: docker-compose logs campfire-backend"
fi

# Check Redis
print_status "Checking Redis..."
if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
    print_success "Redis is responding"
else
    print_error "Redis is not responding"
    echo "Check logs: docker-compose logs redis"
fi

# Check Ollama connectivity
print_status "Checking Ollama connectivity..."
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    print_success "Ollama server is accessible"
else
    print_warning "Ollama server is not accessible"
    echo "Ensure Ollama is running: ollama serve"
fi

# Check Party Box directory
print_status "Checking Party Box directory..."
if [ -d "./party_box" ]; then
    print_success "Party Box directory exists"
else
    print_warning "Party Box directory not found"
    echo "Creating directory..."
    mkdir -p ./party_box
fi

# Check logs directory
print_status "Checking logs directory..."
if [ -d "./logs" ]; then
    print_success "Logs directory exists"
else
    print_warning "Logs directory not found"
    echo "Creating directory..."
    mkdir -p ./logs
fi

# Test MCP endpoint
print_status "Testing MCP endpoint..."
response=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:8080/mcp)
if [ "$response" = "405" ] || [ "$response" = "200" ]; then
    print_success "MCP endpoint is accessible"
else
    print_warning "MCP endpoint returned status: $response"
fi

echo ""
echo "Health check completed!"
echo ""
echo "Service URLs:"
echo "  MCP Server: http://localhost:8080/mcp"
echo "  Health Check: http://localhost:8080/health"
echo "  Redis: localhost:6379"
echo ""
echo "Useful commands:"
echo "  View logs: docker-compose logs -f"
echo "  Restart: docker-compose restart"
echo "  Stop: docker-compose down"
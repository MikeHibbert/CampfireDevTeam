#!/bin/bash

# CampfireValley Backend Deployment Script
# Based on requirements 9.1, 9.2 for Docker deployment

set -e

echo "🔥 CampfireValley Backend Deployment Script"
echo "=========================================="

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
PARTY_BOX_DIR="./party_box"
LOGS_DIR="./logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker Desktop."
        exit 1
    fi
    
    if ! command_exists docker-compose; then
        print_error "Docker Compose is not installed. Please install Docker Compose."
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    mkdir -p "$PARTY_BOX_DIR"
    mkdir -p "$LOGS_DIR"
    
    print_success "Directories created"
}

# Create environment file if it doesn't exist
create_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        print_status "Creating environment file..."
        
        cat > "$ENV_FILE" << EOF
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
EOF
        
        print_success "Environment file created: $ENV_FILE"
        print_warning "Please review and modify $ENV_FILE as needed"
    else
        print_status "Environment file already exists: $ENV_FILE"
    fi
}

# Check Ollama availability
check_ollama() {
    print_status "Checking Ollama server availability..."
    
    # Extract Ollama URL from environment or use default
    OLLAMA_URL="http://localhost:11434"
    if [ -f "$ENV_FILE" ]; then
        OLLAMA_URL=$(grep OLLAMA_URL "$ENV_FILE" | cut -d'=' -f2 | sed 's/host.docker.internal/localhost/')
    fi
    
    if curl -s "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
        print_success "Ollama server is accessible at $OLLAMA_URL"
    else
        print_warning "Ollama server is not accessible at $OLLAMA_URL"
        print_warning "Please ensure Ollama is running on your host system"
        print_warning "You can install Ollama from: https://ollama.ai"
    fi
}

# Build and start services
deploy_services() {
    print_status "Building and starting CampfireValley services..."
    
    # Build the application
    docker-compose -f "$COMPOSE_FILE" build
    
    # Start services
    docker-compose -f "$COMPOSE_FILE" up -d
    
    print_success "Services started successfully"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    # Wait for Redis
    print_status "Waiting for Redis..."
    timeout=30
    while [ $timeout -gt 0 ]; do
        if docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping >/dev/null 2>&1; then
            print_success "Redis is ready"
            break
        fi
        sleep 1
        timeout=$((timeout - 1))
    done
    
    if [ $timeout -eq 0 ]; then
        print_error "Redis failed to start within 30 seconds"
        return 1
    fi
    
    # Wait for MCP server
    print_status "Waiting for MCP server..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if curl -s http://localhost:8080/health >/dev/null 2>&1; then
            print_success "MCP server is ready"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -eq 0 ]; then
        print_warning "MCP server may not be fully ready yet"
        print_warning "Check logs with: docker-compose logs campfire-backend"
    fi
}

# Show deployment status
show_status() {
    print_status "Deployment Status:"
    echo ""
    
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo ""
    print_status "Service URLs:"
    echo "  MCP Server: http://localhost:8080/mcp"
    echo "  Health Check: http://localhost:8080/health"
    echo "  Redis: localhost:6379"
    echo ""
    
    print_status "Useful Commands:"
    echo "  View logs: docker-compose logs -f"
    echo "  Stop services: docker-compose down"
    echo "  Restart services: docker-compose restart"
    echo "  Update services: ./deploy.sh"
    echo ""
}

# Main deployment function
main() {
    echo ""
    print_status "Starting CampfireValley Backend deployment..."
    echo ""
    
    check_prerequisites
    create_directories
    create_env_file
    check_ollama
    deploy_services
    wait_for_services
    show_status
    
    print_success "🔥 CampfireValley Backend deployment completed!"
    print_status "The backend is now running and ready to accept connections from VS Code plugin"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        print_status "Stopping CampfireValley services..."
        docker-compose -f "$COMPOSE_FILE" down
        print_success "Services stopped"
        ;;
    "restart")
        print_status "Restarting CampfireValley services..."
        docker-compose -f "$COMPOSE_FILE" restart
        print_success "Services restarted"
        ;;
    "logs")
        docker-compose -f "$COMPOSE_FILE" logs -f
        ;;
    "status")
        docker-compose -f "$COMPOSE_FILE" ps
        ;;
    "clean")
        print_warning "This will remove all containers, volumes, and images"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose -f "$COMPOSE_FILE" down -v --rmi all
            print_success "Cleanup completed"
        fi
        ;;
    "help")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy CampfireValley backend (default)"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  logs     - Show service logs"
        echo "  status   - Show service status"
        echo "  clean    - Remove all containers and images"
        echo "  help     - Show this help message"
        ;;
    *)
        print_error "Unknown command: $1"
        print_status "Use '$0 help' for available commands"
        exit 1
        ;;
esac
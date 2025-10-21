# CampfireDevTeam

A VS Code extension that integrates with CampfireValley backend to provide AI-powered development assistance through the Party Box protocol.

## Overview

CampfireDevTeam consists of two main components:

1. **VS Code Extension** - Frontend plugin that captures workspace context and communicates with the backend
2. **CampfireValley Backend** - Python FastAPI server with AI processing capabilities using Ollama

## Architecture

The system uses a "Party Box" protocol for communication between the VS Code extension and the backend. Party Boxes contain development tasks, file attachments, and context information that are processed through a "riverboat system" with specialized processing campfires.

### Processing Flow

1. **VS Code Extension** creates Party Box with task and workspace context
2. **Riverboat System** routes Party Box through processing campfires:
   - **Unloading Campfire** - Unpacks and extracts content
   - **Security Campfire** - Validates for security compliance  
   - **DevTeam Campfire** - AI processing with specialized campers
   - **Offloading Campfire** - Packages results for return
3. **Response** delivered back to VS Code with generated code, suggestions, or commands

## Components

### Backend (Python)
- FastAPI server with MCP (Model Context Protocol) support
- Redis integration for caching and monitoring
- Ollama integration for AI model processing
- Docker containerization support

### Frontend (TypeScript/VS Code Extension)
- Workspace context capture
- Party Box protocol implementation
- File operations and terminal management
- Configuration management

## Getting Started

### Prerequisites
- Node.js and npm
- Python 3.8+
- Docker (optional)
- Ollama (for AI processing)
- Redis (for caching)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables (copy .env.example to .env and configure)

4. Run with Docker Compose:
   ```bash
   docker-compose up
   ```

   Or run directly:
   ```bash
   python mcp_server.py
   ```

### VS Code Extension Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run compile
   ```

3. Run in development mode:
   ```bash
   npm run watch
   ```

## Development

This project follows a spec-driven development approach with detailed requirements, design documents, and implementation tasks located in `.kiro/specs/campfire-dev-team/`.

### Key Features Implemented

- ✅ Party Box protocol for VS Code ↔ Backend communication
- ✅ Riverboat system with processing campfires
- ✅ Security validation and workspace boundary checking
- ✅ Redis integration for caching and monitoring
- ✅ Ollama integration for AI processing
- 🚧 Specialized DevTeam campers (in progress)
- 🚧 Advanced workspace operations (planned)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Add your license information here]

## Architecture Diagram

```
┌─────────────────┐    Party Box     ┌──────────────────────┐
│   VS Code       │ ──────────────► │  CampfireValley      │
│   Extension     │                 │  Backend             │
│                 │ ◄────────────── │                      │
└─────────────────┘    Response     └──────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────────┐
                                    │  Riverboat System    │
                                    └──────────────────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        ▼                     ▼                     ▼
                ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                │  Unloading   │    │  Security    │    │  Offloading  │
                │  Campfire    │    │  Campfire    │    │  Campfire    │
                └──────────────┘    └──────────────┘    └──────────────┘
                                              │
                                              ▼
                                    ┌──────────────────────┐
                                    │  DevTeam Campfire    │
                                    │  (AI Processing)     │
                                    └──────────────────────┘
```
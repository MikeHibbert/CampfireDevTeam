# 🎬 CampfireDevTeam Demo Guide

## Overview
This guide shows how to demonstrate the complete CampfireDevTeam system - a VS Code extension that connects to an AI-powered backend with specialized development campers.

## 🚀 Quick Start Demo (5 minutes)

### 1. Backend Health Check
```bash
# Check backend status
curl http://localhost:8080/health

# Expected: Shows Redis connected, Ollama available, 2 campfires loaded
```

### 2. VS Code Extension Demo
1. **Open VS Code** in this workspace
2. **Press F5** to launch Extension Development Host
3. **Look for "Campfire Chat" panel** in Explorer sidebar (🔥 icon)
4. **Also available via Command Palette** (Ctrl+Shift+P):
   - `Campfire: Generate Code`
   - `Campfire: Review Code`
   - `Campfire: Open Chat`

### 3. **NEW!** Chat Panel Demo (Recommended)
1. **Click on Campfire Chat panel** in sidebar
2. **Type naturally**: "Create a Python function to calculate fibonacci numbers"
3. **Watch real-time response**: BackEndDev camper generates code
4. **Click "📄 Create fibonacci.py"** to create the file instantly
5. **Continue conversation**: "Now review this code for performance"

### 4. Traditional Command Demo
1. **Run "Campfire: Generate Code"** from Command Palette
2. **Enter task**: "Create a REST API endpoint for user authentication"
3. **Watch the magic**: Extension sends request to backend, gets AI-generated code
4. **Result**: Code appears in editor or new file

### 5. Code Review Demo
1. **Open** `demo/sample_code.py` (intentionally vulnerable)
2. **In Chat Panel, type**: "Review this code for security issues"
3. **Watch analysis**: Auditor camper identifies multiple vulnerabilities
4. **Get actionable advice**: Specific remediation steps provided

## 🎯 Detailed Demo Scenarios (15-20 minutes)

### Scenario 1: Full Development Workflow
**Story**: "Let's build a REST API endpoint"

1. **Generate Code**:
   - Task: "Create a FastAPI endpoint for user registration with email validation"
   - Shows: BackEndDev camper creates production-ready code

2. **Review Code**:
   - Shows: Auditor camper finds security issues, suggests improvements

3. **Terminal Commands**:
   - Task: "Show me how to test this API endpoint"
   - Shows: TerminalExpert provides curl commands and testing strategies

### Scenario 2: Cross-Platform Development
**Story**: "Supporting multiple operating systems"

1. **Windows-specific task**:
   - Task: "Create a PowerShell script to deploy this application"
   - Shows: OSExpert camper provides Windows-optimized solution

2. **Linux deployment**:
   - Task: "Create Docker deployment for Linux production"
   - Shows: DevOps camper provides containerization strategy

### Scenario 3: Frontend + Backend Integration
**Story**: "Building a complete web application"

1. **Backend API**:
   - Task: "Create a Python Flask API for todo management"
   - Shows: BackEndDev camper creates server code

2. **Frontend Interface**:
   - Task: "Create a React component to display todo items"
   - Shows: FrontEndDev camper creates UI code

3. **Testing Strategy**:
   - Task: "How should I test this todo application?"
   - Shows: Tester camper provides comprehensive testing approach

## 🔧 Technical Deep Dive (Advanced Demo)

### Backend Architecture Showcase
```bash
# Show available campfires
curl http://localhost:8080/campfires

# Show active campfire details
curl http://localhost:8080/campfires/DevTeam

# Show system statistics
curl http://localhost:8080/storage/stats
```

### Party Box Protocol Demo
```bash
# Send raw Party Box request
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "torch": {
      "claim": "generate_code",
      "task": "Create a hello world function",
      "os": "windows",
      "workspace_root": "C:\\demo",
      "attachments": [],
      "context": {
        "current_file": null,
        "project_structure": [],
        "terminal_history": []
      }
    }
  }'
```

### Docker Integration Demo
```bash
# Show running containers
docker ps

# View backend logs
docker logs campfire-backend

# Show Redis data
docker exec campfire-redis redis-cli keys "*"
```

## 🎨 Demo Tips & Tricks

### Visual Impact
1. **Split Screen**: VS Code on left, terminal/browser on right
2. **Show Logs**: Keep `docker logs -f campfire-backend` running
3. **Network Tab**: Show HTTP requests in browser dev tools

### Talking Points
- **AI-Powered**: 8 specialized campers with different expertise
- **Secure**: Path validation, workspace boundaries, security scanning
- **Scalable**: Docker deployment, Redis caching, configurable
- **Extensible**: Manifest-driven campfire system

### Common Demo Scenarios
1. **"I need to build a web API"** → Generate + Review workflow
2. **"How do I deploy this?"** → DevOps camper provides Docker/cloud guidance
3. **"Is my code secure?"** → Auditor camper performs security analysis
4. **"I'm stuck with this error"** → TerminalExpert provides debugging commands

## 🐛 Troubleshooting Demo Issues

### Backend Not Responding
```bash
# Restart containers
docker-compose -f backend/docker-compose.yml down
docker-compose -f backend/docker-compose.yml up -d

# Check logs
docker logs campfire-backend
```

### VS Code Extension Issues
1. **Reload Window**: Ctrl+Shift+P → "Developer: Reload Window"
2. **Check Output**: View → Output → "CampfireDevAgent"
3. **Restart Extension Host**: Close and reopen with F5

### Network Issues
```bash
# Test local connectivity
curl http://localhost:8080/health

# Check Docker networking
docker network ls
docker network inspect backend_campfire-network
```

## 📊 Demo Metrics to Highlight

- **Response Time**: < 1 second for simple tasks
- **Camper Specializations**: 8 different expert roles
- **Security**: Comprehensive validation and sandboxing
- **Scalability**: Redis caching, Docker deployment
- **Flexibility**: Configurable campfires, multiple OS support

## 🎯 Demo Outcomes

After the demo, viewers should understand:
1. **How to use** the VS Code extension for development tasks
2. **The power** of specialized AI campers for different development needs
3. **The architecture** that makes it secure and scalable
4. **The potential** for extending with custom campfires and workflows

---

**Pro Tip**: Start with the 5-minute quick demo to hook the audience, then dive deeper based on their interest level!
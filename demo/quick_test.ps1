# Quick Demo Test Script for CampfireDevTeam
# Run this to verify everything is working before your demo

Write-Host "CampfireDevTeam Demo Test Script" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow

# Test 1: Check Docker containers
Write-Host "`n1. Checking Docker containers..." -ForegroundColor Cyan
$containers = docker ps --format "table {{.Names}}\t{{.Status}}"
if ($containers -match "campfire-backend.*Up" -and $containers -match "campfire-redis.*Up") {
    Write-Host "✅ Docker containers are running" -ForegroundColor Green
} else {
    Write-Host "❌ Docker containers not running. Run: docker-compose -f backend/docker-compose.yml up -d" -ForegroundColor Red
    exit 1
}

# Test 2: Check backend health
Write-Host "`n2. Testing backend health..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method GET
    if ($health.status -eq "healthy") {
        Write-Host "✅ Backend is healthy" -ForegroundColor Green
        Write-Host "   - Redis: $($health.connections.redis.status)" -ForegroundColor Gray
        Write-Host "   - Ollama: $($health.connections.ollama.status)" -ForegroundColor Gray
        Write-Host "   - Campfires: $($health.campfires.total_count)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Backend health check failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Cannot connect to backend at localhost:8080" -ForegroundColor Red
    Write-Host "   Make sure Docker containers are running" -ForegroundColor Red
}

# Test 3: Test MCP endpoint with simple request
Write-Host "`n3. Testing MCP endpoint..." -ForegroundColor Cyan
$testPayload = @{
    torch = @{
        claim = "generate_code"
        task = "Create a simple hello world function"
        os = "windows"
        workspace_root = "C:\demo"
        attachments = @()
        context = @{
            current_file = $null
            project_structure = @()
            terminal_history = @()
        }
    }
    metadata = @{
        test = $true
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/mcp" -Method POST -Body $testPayload -ContentType "application/json"
    if ($response.torch) {
        Write-Host "✅ MCP endpoint working" -ForegroundColor Green
        Write-Host "   Response type: $($response.torch.claim)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ MCP endpoint test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Check available campfires
Write-Host "`n4. Checking available campfires..." -ForegroundColor Cyan
try {
    $campfires = Invoke-RestMethod -Uri "http://localhost:8080/campfires" -Method GET
    Write-Host "✅ Available campfires: $($campfires.available_campfires -join ', ')" -ForegroundColor Green
    Write-Host "   Active campfire: $($campfires.active_campfire)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Could not retrieve campfires" -ForegroundColor Red
}

# Test 5: VS Code Extension Check
Write-Host "`n5. VS Code Extension Setup..." -ForegroundColor Cyan
if (Test-Path "out/extension.js") {
    Write-Host "✅ Extension compiled successfully" -ForegroundColor Green
    Write-Host "   Ready to launch with F5 in VS Code" -ForegroundColor Gray
} else {
    Write-Host "❌ Extension not compiled. Run: npm run compile" -ForegroundColor Red
}

Write-Host "`nDemo Readiness Summary:" -ForegroundColor Yellow
Write-Host "========================" -ForegroundColor Yellow
Write-Host "1. Open VS Code in this workspace" -ForegroundColor White
Write-Host "2. Press F5 to launch Extension Development Host" -ForegroundColor White
Write-Host "3. Use Ctrl+Shift+P and type 'Campfire' to see commands" -ForegroundColor White
Write-Host "4. Try 'Campfire: Generate Code' with tasks from demo/demo_tasks.md" -ForegroundColor White
Write-Host "5. Use demo/sample_code.py for code review demonstrations" -ForegroundColor White

Write-Host "`nReady to demo CampfireDevTeam!" -ForegroundColor Green
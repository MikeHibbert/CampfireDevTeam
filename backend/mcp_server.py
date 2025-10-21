#!/usr/bin/env python3
"""
CampfireValley MCP Server
FastAPI server with Party Box handling for CampfireDevTeam
"""

import os
import asyncio
import json
import logging
import traceback
from datetime import datetime
from typing import List, Optional, Dict, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError, Field
import uvicorn
import redis.asyncio as redis
import httpx

# Import the new riverboat system and error handling
from party_box import RiverboatSystem
from party_box.error_handler import (
    error_handler, 
    SecurityValidationError, 
    PartyBoxValidationError, 
    RiverboatProcessingError,
    ErrorType,
    ErrorSeverity
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Data Models
class Attachment(BaseModel):
    path: str
    content: str
    type: str
    timestamp: datetime

class Context(BaseModel):
    current_file: Optional[str] = None
    project_structure: List[str] = Field(default_factory=list)
    terminal_history: List[str] = Field(default_factory=list)

class Torch(BaseModel):
    claim: str  # generate_code, review_code, execute_command
    task: str
    os: str
    workspace_root: str
    attachments: List[Attachment] = Field(default_factory=list)
    context: Context = Field(default_factory=Context)

class PartyBox(BaseModel):
    torch: Torch
    metadata: Dict[str, Any] = Field(default_factory=dict)

class CamperResponse(BaseModel):
    camper_role: str
    response_type: str  # code, suggestion, command, error
    content: str
    files_to_create: List[Dict[str, str]] = Field(default_factory=list)
    commands_to_execute: List[str] = Field(default_factory=list)
    confidence_score: float = 1.0

class BackendRequest(BaseModel):
    action: str  # list_directory, get_console, get_code_section, update_code
    parameters: Dict[str, Any] = Field(default_factory=dict)
    target_path: Optional[str] = None

# Initialize FastAPI app
app = FastAPI(
    title="CampfireValley MCP Server",
    description="MCP Server for CampfireDevTeam with Party Box protocol support",
    version="1.0.0"
)

# Global configuration
PARTY_BOX_PATH = Path(os.getenv("PARTY_BOX_PATH", "./party_box"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")

# Ensure party box directory exists
PARTY_BOX_PATH.mkdir(exist_ok=True)

class RedisConnection:
    """Redis connection manager for MCP brokering"""
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis_client = None
        
    async def connect(self):
        """Establish Redis connection"""
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            await self.redis_client.ping()
            logger.info(f"Connected to Redis at {self.redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            raise
    
    async def disconnect(self):
        """Close Redis connection"""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Disconnected from Redis")
    
    async def publish_message(self, channel: str, message: Dict[str, Any]):
        """Publish message to Redis channel"""
        if not self.redis_client:
            raise RuntimeError("Redis client not connected")
        
        message_json = json.dumps(message, default=str)
        await self.redis_client.publish(channel, message_json)
        logger.info(f"Published message to channel {channel}")
    
    async def get_cached_response(self, key: str) -> Optional[Dict[str, Any]]:
        """Get cached response from Redis"""
        if not self.redis_client:
            return None
        
        cached = await self.redis_client.get(key)
        if cached:
            return json.loads(cached)
        return None
    
    async def cache_response(self, key: str, response: Dict[str, Any], ttl: int = 3600):
        """Cache response in Redis with TTL"""
        if not self.redis_client:
            return
        
        response_json = json.dumps(response, default=str)
        await self.redis_client.setex(key, ttl, response_json)
        logger.info(f"Cached response with key {key}")

class OllamaClient:
    """Ollama server client for AI model interactions"""
    
    def __init__(self, ollama_url: str):
        self.ollama_url = ollama_url
        self.client = httpx.AsyncClient(timeout=30.0)
        
    async def health_check(self) -> bool:
        """Check if Ollama server is available"""
        try:
            response = await self.client.get(f"{self.ollama_url}/api/tags")
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Ollama health check failed: {str(e)}")
            return False
    
    async def generate_response(self, model: str, prompt: str, system_prompt: str = None) -> Dict[str, Any]:
        """Generate response from Ollama model"""
        try:
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False
            }
            
            if system_prompt:
                payload["system"] = system_prompt
            
            response = await self.client.post(
                f"{self.ollama_url}/api/generate",
                json=payload
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Ollama request failed: {response.status_code} - {response.text}")
                return {"error": f"Ollama request failed: {response.status_code}"}
                
        except Exception as e:
            logger.error(f"Error calling Ollama: {str(e)}")
            return {"error": f"Ollama error: {str(e)}"}
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

# Initialize connections
redis_conn = RedisConnection(REDIS_URL)
ollama_client = OllamaClient(OLLAMA_URL)

class RiverboatSystem:
    """Riverboat system for Party Box routing with Redis and Ollama integration"""
    
    def __init__(self, redis_conn: RedisConnection, ollama_client: OllamaClient):
        self.party_box_storage = PARTY_BOX_PATH
        self.redis_conn = redis_conn
        self.ollama_client = ollama_client
        
    async def receive_party_box(self, party_box: PartyBox) -> Dict[str, Any]:
        """Process incoming Party Box through the riverboat system"""
        try:
            # Store incoming Party Box
            party_box_id = await self._store_party_box(party_box, "incoming")
            
            # Check for cached response
            cache_key = f"party_box:{party_box.torch.claim}:{hash(party_box.torch.task)}"
            cached_response = await self.redis_conn.get_cached_response(cache_key)
            if cached_response:
                logger.info("Returning cached response")
                return cached_response
            
            # Publish to Redis for monitoring
            await self.redis_conn.publish_message("party_box_received", {
                "party_box_id": party_box_id,
                "claim": party_box.torch.claim,
                "task": party_box.torch.task,
                "timestamp": datetime.now().isoformat()
            })
            
            # Route through processing campfires
            unpacked = await self._unloading_campfire(party_box)
            validated = await self._security_campfire(unpacked)
            
            if validated.get("secure", False):
                # Route to DevTeam with Ollama integration
                result = await self._devteam_campfire(validated)
                
                # Package response
                response = await self._offloading_campfire(result)
                
                # Cache the response
                await self.redis_conn.cache_response(cache_key, response, ttl=1800)  # 30 minutes
                
                # Store response Party Box
                await self._store_party_box(response, "outgoing", party_box_id)
                
                # Publish completion to Redis
                await self.redis_conn.publish_message("party_box_completed", {
                    "party_box_id": party_box_id,
                    "timestamp": datetime.now().isoformat()
                })
                
                return response
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Party Box failed security validation"
                )
                
        except Exception as e:
            logger.error(f"Error processing Party Box: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {str(e)}"
            )
    
    async def _store_party_box(self, party_box: Any, direction: str, party_box_id: str = None) -> str:
        """Store Party Box to filesystem"""
        if party_box_id is None:
            party_box_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        
        filename = f"{direction}_{party_box_id}.json"
        filepath = self.party_box_storage / filename
        
        # Convert to dict if it's a Pydantic model
        if hasattr(party_box, 'model_dump'):
            data = party_box.model_dump()
        else:
            data = party_box
            
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, default=str)
            
        logger.info(f"Stored Party Box: {filename}")
        return party_box_id
    
    async def _unloading_campfire(self, party_box: PartyBox) -> Dict[str, Any]:
        """Unpack Party Box contents and extract file paths, content, task assertions"""
        logger.info("Processing through unloading campfire")
        
        unpacked = {
            "torch": party_box.torch.model_dump(),
            "file_paths": [att.path for att in party_box.torch.attachments],
            "task_assertions": party_box.torch.task,
            "workspace_root": party_box.torch.workspace_root,
            "os_type": party_box.torch.os,
            "metadata": party_box.metadata
        }
        
        return unpacked
    
    async def _security_campfire(self, unpacked_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate Party Box contents for security compliance"""
        logger.info("Processing through security campfire")
        
        # Basic security validation
        workspace_root = unpacked_data.get("workspace_root", "")
        file_paths = unpacked_data.get("file_paths", [])
        
        # Check for path traversal attempts
        for file_path in file_paths:
            if ".." in file_path or file_path.startswith("/"):
                logger.warning(f"Security violation: suspicious path {file_path}")
                return {"secure": False, "reason": "Path traversal attempt detected"}
        
        # Check workspace boundary
        if not workspace_root:
            logger.warning("Security violation: no workspace root specified")
            return {"secure": False, "reason": "No workspace root specified"}
        
        # Add security validation results
        validated = unpacked_data.copy()
        validated["secure"] = True
        validated["security_checks"] = {
            "path_traversal": "passed",
            "workspace_boundary": "passed",
            "timestamp": datetime.now().isoformat()
        }
        
        return validated
    
    async def _devteam_campfire(self, validated_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process through DevTeam campfire with Ollama integration"""
        logger.info("Processing through DevTeam campfire")
        
        torch_data = validated_data.get("torch", {})
        task = torch_data.get("task", "")
        claim = torch_data.get("claim", "")
        os_type = torch_data.get("os", "linux")
        
        # Check Ollama availability
        ollama_available = await self.ollama_client.health_check()
        
        if ollama_available:
            # Use Ollama for AI processing
            response = await self._process_with_ollama(claim, task, os_type, torch_data)
        else:
            # Fallback to mock responses
            logger.warning("Ollama not available, using fallback responses")
            response = await self._process_with_fallback(claim, task, os_type)
        
        return response
    
    async def _process_with_ollama(self, claim: str, task: str, os_type: str, torch_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process request using Ollama AI models"""
        camper_responses = []
        
        # Define camper prompts based on claim type
        if claim == "generate_code":
            # BackEndDev camper
            backend_prompt = f"""You are a BackEndDev camper in CampfireValley. Generate backend code for the following task:
Task: {task}
OS: {os_type}

Provide clean, production-ready code with proper error handling and documentation.
Focus on backend functionality and best practices."""
            
            backend_response = await self.ollama_client.generate_response(
                model="codellama:7b",  # Default model, can be configured
                prompt=backend_prompt,
                system_prompt="You are an expert backend developer. Provide concise, working code solutions."
            )
            
            if "error" not in backend_response:
                camper_responses.append({
                    "camper_role": "BackEndDev",
                    "response_type": "code",
                    "content": backend_response.get("response", ""),
                    "files_to_create": [{"path": "generated_backend.py", "content": backend_response.get("response", "")}],
                    "commands_to_execute": [],
                    "confidence_score": 0.8
                })
        
        elif claim == "review_code":
            # Auditor camper
            auditor_prompt = f"""You are an Auditor camper in CampfireValley. Review the following code task:
Task: {task}
OS: {os_type}

Provide a comprehensive code review focusing on:
- Security vulnerabilities
- Code quality and best practices
- Performance considerations
- Maintainability
- Testing recommendations"""
            
            auditor_response = await self.ollama_client.generate_response(
                model="codellama:7b",
                prompt=auditor_prompt,
                system_prompt="You are an expert code auditor. Provide detailed, actionable feedback."
            )
            
            if "error" not in auditor_response:
                camper_responses.append({
                    "camper_role": "Auditor",
                    "response_type": "suggestion",
                    "content": auditor_response.get("response", ""),
                    "files_to_create": [],
                    "commands_to_execute": [],
                    "confidence_score": 0.9
                })
        
        elif claim == "execute_command":
            # TerminalExpert camper
            terminal_prompt = f"""You are a TerminalExpert camper in CampfireValley. Provide terminal commands for:
Task: {task}
OS: {os_type}

Provide appropriate {os_type}-specific commands for:
- Debugging
- Log checking
- Docker operations
- Python execution
- Development workflow

Format as executable commands with explanations."""
            
            terminal_response = await self.ollama_client.generate_response(
                model="codellama:7b",
                prompt=terminal_prompt,
                system_prompt=f"You are an expert in {os_type} terminal operations. Provide safe, effective commands."
            )
            
            if "error" not in terminal_response:
                # Extract commands from response (basic parsing)
                response_text = terminal_response.get("response", "")
                commands = [line.strip() for line in response_text.split('\n') if line.strip().startswith(('$', '>', 'cmd>', 'PS>'))]
                
                camper_responses.append({
                    "camper_role": "TerminalExpert",
                    "response_type": "command",
                    "content": response_text,
                    "files_to_create": [],
                    "commands_to_execute": commands,
                    "confidence_score": 0.8
                })
        
        # If no specific responses, use RequirementsGatherer
        if not camper_responses:
            req_prompt = f"""You are a RequirementsGatherer camper in CampfireValley. Analyze this task:
Task: {task}
Claim: {claim}
OS: {os_type}

Provide a detailed analysis of requirements and suggest next steps."""
            
            req_response = await self.ollama_client.generate_response(
                model="codellama:7b",
                prompt=req_prompt,
                system_prompt="You are an expert requirements analyst. Provide clear, actionable requirements."
            )
            
            if "error" not in req_response:
                camper_responses.append({
                    "camper_role": "RequirementsGatherer",
                    "response_type": "suggestion",
                    "content": req_response.get("response", ""),
                    "files_to_create": [],
                    "commands_to_execute": [],
                    "confidence_score": 0.7
                })
        
        return {"camper_responses": camper_responses}
    
    async def _process_with_fallback(self, claim: str, task: str, os_type: str) -> Dict[str, Any]:
        """Fallback processing when Ollama is not available"""
        if claim == "generate_code":
            response = {
                "camper_responses": [
                    {
                        "camper_role": "BackEndDev",
                        "response_type": "code",
                        "content": f"# Generated code for: {task}\n# OS: {os_type}\nprint('Hello from CampfireValley!')\n# Note: Ollama unavailable, using fallback response",
                        "files_to_create": [{"path": "generated_code.py", "content": f"# {task}\nprint('Generated code')"}],
                        "commands_to_execute": [],
                        "confidence_score": 0.5
                    }
                ]
            }
        elif claim == "review_code":
            response = {
                "camper_responses": [
                    {
                        "camper_role": "Auditor",
                        "response_type": "suggestion",
                        "content": f"Code review for: {task}\n- Consider adding error handling\n- Add type hints for better code quality\n- Note: Ollama unavailable, using basic review template",
                        "files_to_create": [],
                        "commands_to_execute": [],
                        "confidence_score": 0.5
                    }
                ]
            }
        else:
            response = {
                "camper_responses": [
                    {
                        "camper_role": "RequirementsGatherer",
                        "response_type": "suggestion",
                        "content": f"Task analysis: {task}\nPlease provide more specific requirements.\nNote: Ollama unavailable, using basic analysis",
                        "files_to_create": [],
                        "commands_to_execute": [],
                        "confidence_score": 0.3
                    }
                ]
            }
        
        return response
    
    async def _offloading_campfire(self, processed_data: Dict[str, Any]) -> Dict[str, Any]:
        """Package processed results into response Party Box"""
        logger.info("Processing through offloading campfire")
        
        # Package the response
        response_party_box = {
            "torch": {
                "claim": "response",
                "task": "processed_response",
                "os": "any",
                "workspace_root": "",
                "attachments": [],
                "context": {}
            },
            "results": processed_data,
            "metadata": {
                "processed_at": datetime.now().isoformat(),
                "server_version": "1.0.0"
            }
        }
        
        return response_party_box

# Initialize riverboat system (will be created in startup event)
riverboat = None

@app.on_event("startup")
async def startup_event():
    """Initialize connections on startup"""
    global riverboat
    try:
        await redis_conn.connect()
        ollama_available = await ollama_client.health_check()
        
        # Initialize the new riverboat system
        riverboat = RiverboatSystem(redis_conn, ollama_client, PARTY_BOX_PATH)
        
        logger.info(f"Startup complete - Ollama available: {ollama_available}")
        logger.info("Riverboat system initialized with enhanced processing campfires")
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up connections on shutdown"""
    try:
        await redis_conn.disconnect()
        await ollama_client.close()
        logger.info("Shutdown complete")
    except Exception as e:
        logger.error(f"Shutdown error: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint with Redis and Ollama status"""
    # Check Redis connection
    redis_status = "disconnected"
    try:
        if redis_conn.redis_client:
            await redis_conn.redis_client.ping()
            redis_status = "connected"
    except Exception:
        redis_status = "error"
    
    # Check Ollama connection
    ollama_status = "available" if await ollama_client.health_check() else "unavailable"
    
    return {
        "status": "healthy", 
        "service": "campfire-backend",
        "party_box_path": str(PARTY_BOX_PATH),
        "connections": {
            "redis": {
                "url": REDIS_URL,
                "status": redis_status
            },
            "ollama": {
                "url": OLLAMA_URL,
                "status": ollama_status
            }
        }
    }

@app.get("/")
async def root():
    """Root endpoint with comprehensive API documentation"""
    return {
        "message": "CampfireValley MCP Server", 
        "version": "2.0.0",
        "features": [
            "Comprehensive error handling",
            "Security validation",
            "Rate limiting",
            "Request monitoring"
        ],
        "endpoints": {
            "core": [
                "/mcp",
                "/health"
            ],
            "party_box": [
                "/party-box/{id}",
                "/party-box/{id}/status",
                "/party-box/{id}/context"
            ],
            "storage": [
                "/storage/stats",
                "/storage/cleanup"
            ],
            "monitoring": [
                "/errors/statistics",
                "/errors/export",
                "/errors/clear",
                "/security/status"
            ]
        },
        "timestamp": datetime.now().isoformat()
    }

@app.post("/mcp")
async def handle_mcp_request(request: Request):
    """
    Enhanced MCP endpoint with comprehensive error handling
    Implements Party Box protocol parsing and validation
    Requirements: 12.3, 12.7, 13.7
    """
    request_start_time = datetime.now()
    client_ip = request.client.host if request.client else "unknown"
    
    try:
        # Log incoming request
        logger.info(f"MCP request from {client_ip} at {request_start_time.isoformat()}")
        
        # Parse and validate request body
        body = await request.body()
        if not body:
            validation_error = error_handler.handle_party_box_validation_error(
                ["Empty request body"],
                None
            )
            raise HTTPException(
                status_code=400, 
                detail=validation_error.user_message
            )
        
        # Check request size
        body_size = len(body)
        max_request_size = 100 * 1024 * 1024  # 100MB
        if body_size > max_request_size:
            size_error = error_handler.handle_resource_error(
                "request_size",
                f"Request size {body_size} bytes exceeds maximum {max_request_size} bytes"
            )
            raise HTTPException(
                status_code=413,
                detail=size_error.user_message
            )
        
        # Parse JSON with error handling
        try:
            request_data = json.loads(body)
        except json.JSONDecodeError as e:
            json_error = error_handler.handle_party_box_validation_error(
                [f"Invalid JSON format: {str(e)}"],
                {"body_preview": body[:200].decode('utf-8', errors='ignore')}
            )
            raise HTTPException(
                status_code=400, 
                detail=json_error.user_message
            )
        
        # Validate Party Box structure with comprehensive error handling
        try:
            party_box = PartyBox(**request_data)
        except ValidationError as e:
            validation_errors = []
            for error in e.errors():
                field = " -> ".join(str(loc) for loc in error['loc'])
                validation_errors.append(f"{field}: {error['msg']}")
            
            structure_error = error_handler.handle_party_box_validation_error(
                validation_errors,
                {"request_keys": list(request_data.keys()) if isinstance(request_data, dict) else None}
            )
            
            logger.warning(f"Party Box validation failed from {client_ip}: {validation_errors}")
            raise HTTPException(
                status_code=400, 
                detail=structure_error.user_message
            )
        
        # Log successful parsing
        logger.info(f"Successfully parsed Party Box - Claim: {party_box.torch.claim}, Task: {party_box.torch.task[:100]}...")
        
        # Process through riverboat system with timeout
        try:
            response = await asyncio.wait_for(
                riverboat.receive_party_box(party_box),
                timeout=300.0  # 5 minute timeout
            )
            
            # Log successful processing
            processing_time = (datetime.now() - request_start_time).total_seconds()
            logger.info(f"Successfully processed Party Box from {client_ip} in {processing_time:.2f}s")
            
            return JSONResponse(content=response)
            
        except asyncio.TimeoutError:
            timeout_error = error_handler.handle_timeout_error(
                "party_box_processing",
                300.0,
                {"client_ip": client_ip, "claim": party_box.torch.claim}
            )
            logger.error(f"Processing timeout for {client_ip}: {timeout_error.technical_message}")
            raise HTTPException(
                status_code=504,
                detail=timeout_error.user_message
            )
        
    except SecurityValidationError as e:
        security_error = error_handler.handle_security_validation_error(
            e.validation_type,
            str(e),
            e.details
        )
        logger.critical(f"Security validation failed from {client_ip}: {security_error.technical_message}")
        
        return JSONResponse(
            status_code=403,
            content=security_error.to_response_format()
        )
        
    except PartyBoxValidationError as e:
        validation_error = error_handler.handle_party_box_validation_error(
            e.validation_errors,
            e.party_box_data
        )
        logger.warning(f"Party Box validation failed from {client_ip}: {validation_error.technical_message}")
        
        return JSONResponse(
            status_code=400,
            content=validation_error.to_response_format()
        )
        
    except RiverboatProcessingError as e:
        processing_error = error_handler.handle_processing_error(
            e.component,
            e.operation,
            e.original_error or Exception(str(e)),
            {"client_ip": client_ip}
        )
        logger.error(f"Processing error from {client_ip}: {processing_error.technical_message}")
        
        return JSONResponse(
            status_code=500,
            content=processing_error.to_response_format()
        )
        
    except HTTPException as e:
        # Re-raise HTTP exceptions as-is
        logger.warning(f"HTTP exception from {client_ip}: {e.status_code} - {e.detail}")
        raise
        
    except Exception as e:
        # Handle unexpected errors
        unexpected_error = error_handler.create_error(
            ErrorType.UNKNOWN,
            "UNEXPECTED_MCP_ERROR",
            f"Unexpected error in MCP endpoint: {str(e)}",
            {
                "client_ip": client_ip,
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc()
            },
            ErrorSeverity.CRITICAL
        )
        
        logger.critical(f"Unexpected error from {client_ip}: {unexpected_error.technical_message}")
        
        return JSONResponse(
            status_code=500,
            content=unexpected_error.to_response_format()
        )

@app.get("/party-box/{party_box_id}")
async def get_party_box(party_box_id: str):
    """Get Party Box data by ID"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        party_box_data = await riverboat.get_party_box(party_box_id)
        if party_box_data:
            return JSONResponse(content=party_box_data)
        else:
            raise HTTPException(status_code=404, detail="Party Box not found")
            
    except Exception as e:
        logger.error(f"Error retrieving Party Box {party_box_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/party-box/{party_box_id}/status")
async def get_party_box_status(party_box_id: str):
    """Get Party Box status by ID"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        status = await riverboat.get_party_box_status(party_box_id)
        if status:
            return JSONResponse(content=status)
        else:
            raise HTTPException(status_code=404, detail="Party Box not found")
            
    except Exception as e:
        logger.error(f"Error getting Party Box status {party_box_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/party-box/{party_box_id}/context")
async def get_party_box_context(party_box_id: str):
    """Get Party Box context information"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        context_info = await riverboat.get_context_info(party_box_id)
        if context_info:
            return JSONResponse(content=context_info)
        else:
            raise HTTPException(status_code=404, detail="Context not found")
            
    except Exception as e:
        logger.error(f"Error getting context for Party Box {party_box_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/storage/stats")
async def get_storage_stats():
    """Get storage statistics"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        stats = await riverboat.get_storage_stats()
        return JSONResponse(content=stats)
        
    except Exception as e:
        logger.error(f"Error getting storage stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/storage/cleanup")
async def cleanup_storage(max_age_days: int = 1):
    """Clean up old Party Box files"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        cleaned_count = await riverboat.cleanup_old_party_boxes(max_age_days)
        return JSONResponse(content={
            "message": f"Cleaned up {cleaned_count} old Party Box files",
            "cleaned_count": cleaned_count
        })
        
    except Exception as e:
        logger.error(f"Error cleaning up storage: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/errors/statistics")
async def get_error_statistics():
    """Get comprehensive error statistics"""
    try:
        stats = error_handler.get_error_statistics()
        return JSONResponse(content={
            "error_statistics": stats,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting error statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/errors/clear")
async def clear_error_history():
    """Clear error history (admin endpoint)"""
    try:
        error_handler.clear_error_history()
        return JSONResponse(content={
            "message": "Error history cleared successfully",
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error clearing error history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/errors/export")
async def export_error_history():
    """Export error history for debugging"""
    try:
        error_export = error_handler.export_error_history()
        return JSONResponse(content={
            "error_history": json.loads(error_export),
            "exported_at": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error exporting error history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/security/status")
async def get_security_status():
    """Get security validation status and metrics"""
    try:
        stats = error_handler.get_error_statistics()
        security_errors = stats["by_type"].get("security_validation", 0)
        
        return JSONResponse(content={
            "security_status": "operational" if security_errors < 10 else "elevated",
            "security_errors_count": security_errors,
            "total_errors": stats["total_errors"],
            "last_security_incident": None,  # Would be implemented with proper tracking
            "security_level": "high",
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting security status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    """Handle Pydantic validation errors"""
    return JSONResponse(
        status_code=400,
        content={
            "error": "Validation Error",
            "details": exc.errors()
        }
    )

if __name__ == "__main__":
    port = int(os.getenv("MCP_SERVER_PORT", 8080))
    logger.info(f"Starting CampfireValley MCP Server on port {port}")
    logger.info(f"Party Box storage: {PARTY_BOX_PATH}")
    logger.info(f"Ollama URL: {OLLAMA_URL}")
    logger.info(f"Redis URL: {REDIS_URL}")
    
    uvicorn.run(app, host="0.0.0.0", port=port)
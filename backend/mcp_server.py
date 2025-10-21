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

# Removed duplicate RiverboatSystem class - using imported one from party_box module

# Initialize riverboat system (will be created in startup event)
riverboat = None

@app.on_event("startup")
async def startup_event():
    """Initialize connections on startup"""
    global riverboat
    try:
        await redis_conn.connect()
        ollama_available = await ollama_client.health_check()
        
        # Initialize the generic riverboat system with manifest loading
        manifests_directory = Path("/app/manifests")  # Look for manifests in mounted manifests directory
        riverboat = RiverboatSystem(redis_conn, ollama_client, PARTY_BOX_PATH, manifests_directory)
        
        # Load campfires from manifest files
        await riverboat.initialize_campfires()
        
        logger.info(f"Startup complete - Ollama available: {ollama_available}")
        logger.info(f"Riverboat system initialized with {len(riverboat.get_available_campfires())} campfires")
        
        # Log available campfires
        available_campfires = riverboat.get_available_campfires()
        if available_campfires:
            logger.info(f"Available campfires: {', '.join(available_campfires)}")
        else:
            logger.warning("No campfires loaded - using fallback processing")
            
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
    """Health check endpoint with Redis, Ollama, and campfire status"""
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
    
    # Check campfire status
    campfire_status = {
        "available_campfires": [],
        "active_campfire": None,
        "total_count": 0
    }
    
    if riverboat:
        try:
            available_campfires = riverboat.get_available_campfires()
            campfire_status = {
                "available_campfires": available_campfires,
                "active_campfire": riverboat.active_campfire.name if riverboat.active_campfire else None,
                "total_count": len(available_campfires)
            }
        except Exception as e:
            logger.warning(f"Error getting campfire status: {str(e)}")
    
    return {
        "status": "healthy", 
        "service": "campfire-backend",
        "version": "2.0.0-generic",
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
        },
        "campfires": campfire_status
    }

@app.get("/")
async def root():
    """Root endpoint with comprehensive API documentation"""
    return {
        "message": "CampfireValley Generic MCP Server", 
        "version": "2.0.0-generic",
        "description": "Generic configuration-driven campfire engine for CampfireValley",
        "features": [
            "Dynamic campfire loading from manifest files",
            "Generic camper configuration system",
            "Workflow-based processing",
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
            "campfires": [
                "/campfires",
                "/campfires/{name}",
                "/campfires/{name}/activate",
                "/campfires/reload"
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
        "architecture": {
            "type": "generic_engine",
            "configuration_driven": True,
            "manifest_based": True,
            "dynamic_loading": True
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

@app.get("/campfires")
async def list_campfires():
    """List all available campfires"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        available_campfires = riverboat.get_available_campfires()
        active_campfire = riverboat.active_campfire.name if riverboat.active_campfire else None
        
        return JSONResponse(content={
            "available_campfires": available_campfires,
            "active_campfire": active_campfire,
            "total_count": len(available_campfires),
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error listing campfires: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/campfires/{campfire_name}")
async def get_campfire_info(campfire_name: str):
    """Get detailed information about a specific campfire"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        campfire = riverboat.campfire_registry.get_campfire(campfire_name)
        if not campfire:
            raise HTTPException(status_code=404, detail=f"Campfire not found: {campfire_name}")
        
        return JSONResponse(content={
            "name": campfire.name,
            "type": campfire.campfire_type,
            "max_concurrent_tasks": campfire.max_concurrent_tasks,
            "response_timeout": campfire.response_timeout,
            "campers": [
                {
                    "role": role,
                    "specializations": camper.specializations,
                    "confidence_threshold": camper.confidence_threshold
                }
                for role, camper in campfire.campers.items()
            ],
            "workflows": list(campfire.workflows.keys()),
            "security_enabled": campfire.security_config.get("enableSecurityValidation", False),
            "is_active": riverboat.active_campfire and riverboat.active_campfire.name == campfire_name
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting campfire info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/campfires/{campfire_name}/activate")
async def activate_campfire(campfire_name: str):
    """Activate a specific campfire"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        success = riverboat.set_active_campfire(campfire_name)
        if not success:
            raise HTTPException(status_code=404, detail=f"Campfire not found: {campfire_name}")
        
        return JSONResponse(content={
            "message": f"Campfire '{campfire_name}' activated successfully",
            "active_campfire": campfire_name,
            "timestamp": datetime.now().isoformat()
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error activating campfire: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/campfires/reload")
async def reload_campfires():
    """Reload all campfires from manifest files"""
    try:
        if not riverboat:
            raise HTTPException(status_code=503, detail="Riverboat system not initialized")
        
        # Store current active campfire name
        current_active = riverboat.active_campfire.name if riverboat.active_campfire else None
        
        # Reload campfires
        await riverboat.initialize_campfires()
        
        # Try to restore previous active campfire
        if current_active and current_active in riverboat.get_available_campfires():
            riverboat.set_active_campfire(current_active)
        
        available_campfires = riverboat.get_available_campfires()
        active_campfire = riverboat.active_campfire.name if riverboat.active_campfire else None
        
        return JSONResponse(content={
            "message": "Campfires reloaded successfully",
            "available_campfires": available_campfires,
            "active_campfire": active_campfire,
            "total_count": len(available_campfires),
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error reloading campfires: {str(e)}")
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
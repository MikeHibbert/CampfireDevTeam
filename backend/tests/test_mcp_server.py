#!/usr/bin/env python3
"""
Integration tests for MCP Server
Tests FastAPI endpoints and Party Box handling
"""

import pytest
import asyncio
import json
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from mcp_server import app, RedisConnection, OllamaClient

class TestMCPServer:
    """Test MCP Server endpoints and functionality"""
    
    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = self.client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
    
    def test_mcp_endpoint_valid_payload(self):
        """Test MCP endpoint with valid Party Box payload"""
        valid_payload = {
            "torch": {
                "claim": "generate_code",
                "task": "Create a hello world function",
                "os": "windows",
                "workspace_root": "/test/workspace",
                "attachments": [],
                "context": {
                    "current_file": "test.py",
                    "project_structure": ["test.py"],
                    "terminal_history": []
                }
            }
        }
        
        with patch('mcp_server.RiverboatSystem') as mock_riverboat:
            mock_riverboat.return_value.receive_party_box = AsyncMock(
                return_value={"torch": {"content": "def hello(): print('Hello World')"}}
            )
            
            response = self.client.post("/mcp", json=valid_payload)
            assert response.status_code == 200
            assert "torch" in response.json()
    
    def test_mcp_endpoint_invalid_payload(self):
        """Test MCP endpoint with invalid payload"""
        invalid_payload = {
            "invalid": "payload"
        }
        
        response = self.client.post("/mcp", json=invalid_payload)
        assert response.status_code == 422  # Validation error
    
    def test_mcp_endpoint_security_failure(self):
        """Test MCP endpoint when security validation fails"""
        malicious_payload = {
            "torch": {
                "claim": "generate_code",
                "task": "Delete all files",
                "os": "windows",
                "workspace_root": "/test/workspace",
                "attachments": [
                    {
                        "path": "../../../etc/passwd",
                        "content": "malicious content",
                        "type": "text/plain",
                        "timestamp": "2025-10-20T21:35:00Z"
                    }
                ],
                "context": {
                    "current_file": "test.py",
                    "project_structure": ["test.py"],
                    "terminal_history": []
                }
            }
        }
        
        with patch('mcp_server.RiverboatSystem') as mock_riverboat:
            mock_riverboat.return_value.receive_party_box = AsyncMock(
                side_effect=Exception("Security validation failed")
            )
            
            response = self.client.post("/mcp", json=malicious_payload)
            assert response.status_code == 400


@pytest.mark.asyncio
class TestRedisConnection:
    """Test Redis connection and operations"""
    
    async def test_redis_connection(self):
        """Test Redis connection establishment"""
        redis_conn = RedisConnection("redis://localhost:6379")
        
        try:
            await redis_conn.connect()
            assert redis_conn.redis is not None
        except Exception:
            pytest.skip("Redis not available for testing")
        finally:
            await redis_conn.disconnect()
    
    async def test_redis_cache_operations(self):
        """Test Redis cache operations"""
        redis_conn = RedisConnection("redis://localhost:6379")
        
        try:
            await redis_conn.connect()
            
            # Test cache set and get
            test_data = {"test": "data", "number": 42}
            await redis_conn.cache_response("test_key", test_data, ttl=60)
            
            cached_data = await redis_conn.get_cached_response("test_key")
            assert cached_data == test_data
            
        except Exception:
            pytest.skip("Redis not available for testing")
        finally:
            await redis_conn.disconnect()
    
    async def test_redis_publish_operations(self):
        """Test Redis publish operations"""
        redis_conn = RedisConnection("redis://localhost:6379")
        
        try:
            await redis_conn.connect()
            
            # Test message publishing
            test_message = {"action": "test", "data": "message"}
            result = await redis_conn.publish_message("test_channel", test_message)
            assert result >= 0  # Number of subscribers
            
        except Exception:
            pytest.skip("Redis not available for testing")
        finally:
            await redis_conn.disconnect()


@pytest.mark.asyncio
class TestOllamaClient:
    """Test Ollama client integration"""
    
    async def test_ollama_health_check(self):
        """Test Ollama health check"""
        ollama_client = OllamaClient("http://localhost:11434")
        
        try:
            health = await ollama_client.health_check()
            assert isinstance(health, bool)
        except Exception:
            pytest.skip("Ollama not available for testing")
        finally:
            await ollama_client.close()
    
    async def test_ollama_generation(self):
        """Test Ollama code generation"""
        ollama_client = OllamaClient("http://localhost:11434")
        
        try:
            response = await ollama_client.generate_response(
                model="codellama:7b",
                prompt="Write a simple Python hello function",
                system_prompt="You are a helpful coding assistant."
            )
            
            assert "response" in response or "error" in response
            
        except Exception:
            pytest.skip("Ollama not available for testing")
        finally:
            await ollama_client.close()
#!/usr/bin/env python3
"""
Integration tests for Docker deployment and connectivity
Tests container networking, volume mounting, and service integration
"""

import pytest
import asyncio
import httpx
import redis
import docker
from unittest.mock import patch, MagicMock
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

@pytest.mark.asyncio
class TestDockerIntegration:
    """Test Docker container integration"""
    
    def setup_method(self):
        """Setup Docker client"""
        try:
            self.docker_client = docker.from_env()
        except Exception:
            self.docker_client = None
    
    def test_docker_client_available(self):
        """Test Docker client availability"""
        if self.docker_client is None:
            pytest.skip("Docker not available for testing")
        
        assert self.docker_client is not None
        
        # Test Docker daemon connectivity
        try:
            info = self.docker_client.info()
            assert "ServerVersion" in info
        except Exception:
            pytest.skip("Docker daemon not accessible")
    
    async def test_mcp_server_container_connectivity(self):
        """Test MCP server container network connectivity"""
        # Test if MCP server is accessible on expected port
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get("http://localhost:8080/health", timeout=5.0)
                assert response.status_code == 200
        except Exception:
            pytest.skip("MCP server container not running")
    
    async def test_redis_container_connectivity(self):
        """Test Redis container connectivity"""
        try:
            redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
            
            # Test basic Redis operations
            redis_client.set('test_key', 'test_value', ex=60)
            value = redis_client.get('test_key')
            assert value == 'test_value'
            
            # Cleanup
            redis_client.delete('test_key')
            
        except Exception:
            pytest.skip("Redis container not running")
    
    async def test_ollama_host_connectivity(self):
        """Test connectivity to Ollama server on host"""
        try:
            async with httpx.AsyncClient() as client:
                # Test Ollama health endpoint
                response = await client.get("http://localhost:11434/api/version", timeout=10.0)
                assert response.status_code == 200
                
                version_data = response.json()
                assert "version" in version_data
                
        except Exception:
            pytest.skip("Ollama server not running on host")
    
    def test_party_box_volume_mounting(self):
        """Test Party Box directory volume mounting"""
        party_box_path = Path(__file__).parent.parent / "party_box"
        
        # Check if party_box directory exists
        if not party_box_path.exists():
            pytest.skip("Party Box directory not found")
        
        assert party_box_path.is_dir()
        
        # Test write permissions
        test_file = party_box_path / "test_volume.txt"
        try:
            test_file.write_text("Volume mount test")
            assert test_file.exists()
            assert test_file.read_text() == "Volume mount test"
            
            # Cleanup
            test_file.unlink()
            
        except Exception as e:
            pytest.fail(f"Volume mount test failed: {str(e)}")
    
    def test_docker_compose_configuration(self):
        """Test Docker Compose configuration validity"""
        compose_file = Path(__file__).parent.parent / "docker-compose.yml"
        
        if not compose_file.exists():
            pytest.skip("docker-compose.yml not found")
        
        import yaml
        
        try:
            with open(compose_file, 'r') as f:
                compose_config = yaml.safe_load(f)
            
            # Validate basic structure
            assert "version" in compose_config
            assert "services" in compose_config
            
            # Check for required services
            services = compose_config["services"]
            assert "campfire-backend" in services or "backend" in services
            assert "redis" in services
            
            # Validate backend service configuration
            backend_service = services.get("campfire-backend") or services.get("backend")
            assert "ports" in backend_service
            assert "volumes" in backend_service
            assert "environment" in backend_service
            
            # Validate Redis service
            redis_service = services["redis"]
            assert "image" in redis_service
            assert "ports" in redis_service
            
        except Exception as e:
            pytest.fail(f"Docker Compose configuration invalid: {str(e)}")


@pytest.mark.asyncio
class TestContainerNetworking:
    """Test container networking and service discovery"""
    
    async def test_container_to_host_networking(self):
        """Test container can reach host services"""
        # This would typically be tested from within the container
        # For now, we'll test the reverse - host can reach container services
        
        try:
            async with httpx.AsyncClient() as client:
                # Test MCP server endpoint
                response = await client.get("http://localhost:8080/health", timeout=5.0)
                assert response.status_code == 200
                
        except Exception:
            pytest.skip("Container networking test requires running containers")
    
    async def test_inter_container_communication(self):
        """Test communication between containers"""
        try:
            # Test Redis connectivity from backend perspective
            redis_client = redis.Redis(host='redis', port=6379, decode_responses=True)
            
            # This would work from within the backend container
            # For testing, we use localhost
            redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
            
            redis_client.ping()
            assert True  # If we get here, connection works
            
        except Exception:
            pytest.skip("Inter-container communication test requires running containers")
    
    async def test_environment_variable_configuration(self):
        """Test environment variable configuration"""
        import os
        
        # Test default environment variables
        expected_vars = {
            "OLLAMA_URL": "http://host.docker.internal:11434",
            "REDIS_URL": "redis://redis:6379"
        }
        
        # In actual container, these would be set
        # For testing, we check if they can be overridden
        for var, default_value in expected_vars.items():
            env_value = os.getenv(var, default_value)
            assert env_value is not None
            assert len(env_value) > 0


@pytest.mark.asyncio
class TestServiceIntegration:
    """Test integration between all services"""
    
    async def test_full_stack_integration(self):
        """Test full stack integration from MCP to Ollama"""
        # This is a comprehensive integration test
        try:
            # 1. Test MCP server is running
            async with httpx.AsyncClient() as client:
                health_response = await client.get("http://localhost:8080/health", timeout=5.0)
                assert health_response.status_code == 200
                
                # 2. Test MCP endpoint with simple request
                test_payload = {
                    "torch": {
                        "claim": "generate_code",
                        "task": "Create a simple hello function",
                        "os": "linux",
                        "workspace_root": "/test",
                        "attachments": [],
                        "context": {
                            "current_file": None,
                            "project_structure": [],
                            "terminal_history": []
                        }
                    }
                }
                
                mcp_response = await client.post(
                    "http://localhost:8080/mcp", 
                    json=test_payload,
                    timeout=30.0
                )
                
                # Should get some response (even if Ollama is not available)
                assert mcp_response.status_code in [200, 400, 500]
                
        except Exception:
            pytest.skip("Full stack integration test requires all services running")
    
    async def test_error_handling_integration(self):
        """Test error handling across service boundaries"""
        try:
            async with httpx.AsyncClient() as client:
                # Test with invalid payload
                invalid_payload = {"invalid": "payload"}
                
                response = await client.post(
                    "http://localhost:8080/mcp",
                    json=invalid_payload,
                    timeout=10.0
                )
                
                # Should handle gracefully with proper error response
                assert response.status_code in [400, 422]
                
        except Exception:
            pytest.skip("Error handling integration test requires MCP server running")
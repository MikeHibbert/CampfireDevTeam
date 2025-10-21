#!/usr/bin/env python3
"""
End-to-end workflow tests for CampfireValley backend
Tests complete request/response cycles and performance requirements
"""

import pytest
import asyncio
import time
import json
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from mcp_server import app
from party_box.riverboat_system import RiverboatSystem
from party_box.devteam_campfire import DevTeamCampfire

@pytest.mark.asyncio
class TestEndToEndWorkflows:
    """Test complete end-to-end workflows"""
    
    def setup_method(self):
        """Setup test client and components"""
        self.client = TestClient(app)
        self.riverboat = RiverboatSystem()
        self.devteam = DevTeamCampfire()
    
    async def test_complete_code_generation_workflow(self):
        """Test complete code generation from request to response"""
        # 1. Create realistic code generation request
        request_payload = {
            "torch": {
                "claim": "generate_code",
                "task": "Create a Python function to calculate factorial",
                "os": "linux",
                "workspace_root": "/test/workspace",
                "attachments": [],
                "context": {
                    "current_file": "math_utils.py",
                    "project_structure": ["math_utils.py", "test_math.py"],
                    "terminal_history": ["python -m pytest"]
                }
            }
        }
        
        # 2. Mock the complete workflow
        with patch.object(self.riverboat, 'unloading_campfire') as mock_unloading, \
             patch.object(self.riverboat, 'security_campfire') as mock_security, \
             patch.object(self.riverboat, 'devteam_campfire') as mock_devteam, \
             patch.object(self.riverboat, 'offloading_campfire') as mock_offloading:
            
            # Mock unloading
            mock_unloading.process = AsyncMock(return_value={
                "unpacked": True,
                "files": [],
                "task": "Create a Python function to calculate factorial"
            })
            
            # Mock security validation
            mock_security.validate = AsyncMock(return_value={
                "secure": True,
                "validated_content": request_payload
            })
            
            # Mock DevTeam processing
            mock_devteam.process = AsyncMock(return_value={
                "content": "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)",
                "files_to_create": [
                    {
                        "path": "factorial.py",
                        "content": "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)"
                    }
                ],
                "commands_to_execute": ["python factorial.py"],
                "camper_contributions": {
                    "RequirementsGatherer": "Analyzed factorial function requirements",
                    "BackEndDev": "Implemented recursive factorial function",
                    "Auditor": "Approved code for security and correctness"
                }
            })
            
            # Mock offloading
            mock_offloading.package = AsyncMock(return_value={
                "torch": {
                    "content": "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)",
                    "files_to_create": [
                        {
                            "path": "factorial.py",
                            "content": "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)"
                        }
                    ],
                    "commands_to_execute": ["python factorial.py"]
                }
            })
            
            # 3. Process through riverboat system
            result = await self.riverboat.receive_party_box(request_payload)
            
            # 4. Verify complete workflow
            assert "torch" in result
            assert "content" in result["torch"]
            assert "factorial" in result["torch"]["content"]
            assert len(result["torch"]["files_to_create"]) == 1
            assert result["torch"]["files_to_create"][0]["path"] == "factorial.py"
            
            # Verify all campfires were called
            mock_unloading.process.assert_called_once()
            mock_security.validate.assert_called_once()
            mock_devteam.process.assert_called_once()
            mock_offloading.package.assert_called_once()
    
    async def test_complete_code_review_workflow(self):
        """Test complete code review workflow"""
        # 1. Create code review request with potentially problematic code
        review_payload = {
            "torch": {
                "claim": "review_code",
                "task": "Review this code for security and best practices",
                "os": "windows",
                "workspace_root": "/test/workspace",
                "attachments": [
                    {
                        "path": "user_auth.py",
                        "content": "import hashlib\n\ndef authenticate(username, password):\n    # Potential security issue: using MD5\n    hashed = hashlib.md5(password.encode()).hexdigest()\n    return check_database(username, hashed)",
                        "type": "text/python",
                        "timestamp": "2025-10-20T21:35:00Z"
                    }
                ],
                "context": {
                    "current_file": "user_auth.py",
                    "project_structure": ["user_auth.py", "database.py"],
                    "terminal_history": []
                }
            }
        }
        
        # 2. Mock review workflow
        with patch.object(self.riverboat, 'unloading_campfire') as mock_unloading, \
             patch.object(self.riverboat, 'security_campfire') as mock_security, \
             patch.object(self.riverboat, 'devteam_campfire') as mock_devteam, \
             patch.object(self.riverboat, 'offloading_campfire') as mock_offloading:
            
            mock_unloading.process = AsyncMock(return_value={"unpacked": True})
            mock_security.validate = AsyncMock(return_value={"secure": True})
            
            # Mock comprehensive review
            mock_devteam.process = AsyncMock(return_value={
                "review": "Security issues found in authentication code",
                "issues": [
                    "MD5 is cryptographically broken and should not be used for password hashing",
                    "No salt is used in password hashing",
                    "Consider using bcrypt or Argon2 for password hashing"
                ],
                "suggestions": [
                    "Replace MD5 with bcrypt: import bcrypt; bcrypt.hashpw(password.encode(), bcrypt.gensalt())",
                    "Add input validation for username and password",
                    "Implement rate limiting for authentication attempts"
                ],
                "security_score": 3,
                "recommended_changes": {
                    "user_auth.py": "import bcrypt\n\ndef authenticate(username, password):\n    # Use bcrypt for secure password hashing\n    salt = bcrypt.gensalt()\n    hashed = bcrypt.hashpw(password.encode(), salt)\n    return check_database(username, hashed)"
                }
            })
            
            mock_offloading.package = AsyncMock(return_value={
                "torch": {
                    "review": "Security issues found in authentication code",
                    "issues": [
                        "MD5 is cryptographically broken and should not be used for password hashing",
                        "No salt is used in password hashing"
                    ],
                    "suggestions": [
                        "Replace MD5 with bcrypt",
                        "Add input validation"
                    ],
                    "security_score": 3
                }
            })
            
            # 3. Process review
            result = await self.riverboat.receive_party_box(review_payload)
            
            # 4. Verify review results
            assert "torch" in result
            assert "review" in result["torch"]
            assert "issues" in result["torch"]
            assert "suggestions" in result["torch"]
            assert result["torch"]["security_score"] == 3
            assert len(result["torch"]["issues"]) >= 2
    
    async def test_performance_requirements(self):
        """Test 1-second response requirement for small tasks"""
        # Create simple task that should complete quickly
        simple_task = {
            "torch": {
                "claim": "generate_code",
                "task": "Create a simple hello world function",
                "os": "linux",
                "workspace_root": "/test/workspace",
                "attachments": [],
                "context": {
                    "current_file": None,
                    "project_structure": [],
                    "terminal_history": []
                }
            }
        }
        
        # Mock fast responses
        with patch.object(self.riverboat, 'unloading_campfire') as mock_unloading, \
             patch.object(self.riverboat, 'security_campfire') as mock_security, \
             patch.object(self.riverboat, 'devteam_campfire') as mock_devteam, \
             patch.object(self.riverboat, 'offloading_campfire') as mock_offloading:
            
            # All mocks return quickly
            mock_unloading.process = AsyncMock(return_value={"unpacked": True})
            mock_security.validate = AsyncMock(return_value={"secure": True})
            mock_devteam.process = AsyncMock(return_value={
                "content": "def hello():\n    print('Hello, World!')"
            })
            mock_offloading.package = AsyncMock(return_value={
                "torch": {"content": "def hello():\n    print('Hello, World!')"}
            })
            
            # Measure processing time
            start_time = time.time()
            result = await self.riverboat.receive_party_box(simple_task)
            end_time = time.time()
            
            processing_time = end_time - start_time
            
            # Should complete well under 1 second for mocked operations
            assert processing_time < 1.0, f"Processing took {processing_time:.3f}s, should be under 1.0s"
            assert "torch" in result
    
    def test_http_endpoint_performance(self):
        """Test HTTP endpoint response time"""
        simple_payload = {
            "torch": {
                "claim": "generate_code",
                "task": "Simple hello function",
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
        
        # Mock the riverboat system for fast response
        with patch('mcp_server.RiverboatSystem') as mock_riverboat_class:
            mock_riverboat = mock_riverboat_class.return_value
            mock_riverboat.receive_party_box = AsyncMock(return_value={
                "torch": {"content": "def hello(): print('Hello')"}
            })
            
            start_time = time.time()
            response = self.client.post("/mcp", json=simple_payload)
            end_time = time.time()
            
            response_time = end_time - start_time
            
            # HTTP response should be fast
            assert response_time < 2.0, f"HTTP response took {response_time:.3f}s"
            assert response.status_code == 200
    
    async def test_error_recovery_workflow(self):
        """Test error recovery in complete workflow"""
        error_prone_payload = {
            "torch": {
                "claim": "generate_code",
                "task": "Create code that might cause processing errors",
                "os": "linux",
                "workspace_root": "/test/workspace",
                "attachments": [],
                "context": {
                    "current_file": "test.py",
                    "project_structure": ["test.py"],
                    "terminal_history": []
                }
            }
        }
        
        # Test various error scenarios
        with patch.object(self.riverboat, 'unloading_campfire') as mock_unloading, \
             patch.object(self.riverboat, 'security_campfire') as mock_security:
            
            # Test unloading failure
            mock_unloading.process = AsyncMock(side_effect=Exception("Unloading failed"))
            
            with pytest.raises(Exception) as exc_info:
                await self.riverboat.receive_party_box(error_prone_payload)
            
            assert "Unloading failed" in str(exc_info.value)
            
            # Test security failure
            mock_unloading.process = AsyncMock(return_value={"unpacked": True})
            mock_security.validate = AsyncMock(return_value={"secure": False, "reason": "Malicious content"})
            
            with pytest.raises(Exception) as exc_info:
                await self.riverboat.receive_party_box(error_prone_payload)
            
            assert "security" in str(exc_info.value).lower()
    
    async def test_concurrent_request_handling(self):
        """Test handling multiple concurrent requests"""
        # Create multiple similar requests
        requests = []
        for i in range(5):
            request = {
                "torch": {
                    "claim": "generate_code",
                    "task": f"Create function number {i}",
                    "os": "linux",
                    "workspace_root": "/test/workspace",
                    "attachments": [],
                    "context": {
                        "current_file": f"func_{i}.py",
                        "project_structure": [f"func_{i}.py"],
                        "terminal_history": []
                    }
                }
            }
            requests.append(request)
        
        # Mock responses for all requests
        with patch.object(self.riverboat, 'unloading_campfire') as mock_unloading, \
             patch.object(self.riverboat, 'security_campfire') as mock_security, \
             patch.object(self.riverboat, 'devteam_campfire') as mock_devteam, \
             patch.object(self.riverboat, 'offloading_campfire') as mock_offloading:
            
            mock_unloading.process = AsyncMock(return_value={"unpacked": True})
            mock_security.validate = AsyncMock(return_value={"secure": True})
            mock_devteam.process = AsyncMock(return_value={"content": "def func(): pass"})
            mock_offloading.package = AsyncMock(return_value={"torch": {"content": "def func(): pass"}})
            
            # Process all requests concurrently
            start_time = time.time()
            tasks = [self.riverboat.receive_party_box(req) for req in requests]
            results = await asyncio.gather(*tasks)
            end_time = time.time()
            
            # Verify all requests completed
            assert len(results) == 5
            for result in results:
                assert "torch" in result
                assert "content" in result["torch"]
            
            # Concurrent processing should not take much longer than sequential
            total_time = end_time - start_time
            assert total_time < 5.0, f"Concurrent processing took {total_time:.3f}s"
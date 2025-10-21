#!/usr/bin/env python3
"""
Integration tests for Riverboat System
Tests message routing and campfire integration
"""

import pytest
import asyncio
import json
from unittest.mock import AsyncMock, patch, MagicMock
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from party_box.riverboat_system import RiverboatSystem
from party_box.processing_campfires import UnloadingCampfire, SecurityCampfire, OffloadingCampfire

@pytest.mark.asyncio
class TestRiverboatSystem:
    """Test Riverboat System message routing"""
    
    def setup_method(self):
        """Setup test riverboat system"""
        self.riverboat = RiverboatSystem()
    
    async def test_party_box_routing_success(self):
        """Test successful Party Box routing through campfires"""
        test_party_box = {
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
        
        # Mock campfire responses
        with patch.object(self.riverboat, 'unloading_campfire') as mock_unloading, \
             patch.object(self.riverboat, 'security_campfire') as mock_security, \
             patch.object(self.riverboat, 'devteam_campfire') as mock_devteam, \
             patch.object(self.riverboat, 'offloading_campfire') as mock_offloading:
            
            mock_unloading.process = AsyncMock(return_value={
                "unpacked": True,
                "files": [],
                "task": "Create a hello world function"
            })
            
            mock_security.validate = AsyncMock(return_value={
                "secure": True,
                "validated_content": test_party_box
            })
            
            mock_devteam.process = AsyncMock(return_value={
                "content": "def hello(): print('Hello World')",
                "files_to_create": [{"path": "hello.py", "content": "def hello(): print('Hello World')"}]
            })
            
            mock_offloading.package = AsyncMock(return_value={
                "torch": {
                    "content": "def hello(): print('Hello World')",
                    "files_to_create": [{"path": "hello.py", "content": "def hello(): print('Hello World')"}]
                }
            })
            
            result = await self.riverboat.receive_party_box(test_party_box)
            
            assert "torch" in result
            assert "content" in result["torch"]
            mock_unloading.process.assert_called_once()
            mock_security.validate.assert_called_once()
            mock_devteam.process.assert_called_once()
            mock_offloading.package.assert_called_once()
    
    async def test_security_validation_failure(self):
        """Test Party Box rejection due to security validation failure"""
        malicious_party_box = {
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
        
        with patch.object(self.riverboat, 'unloading_campfire') as mock_unloading, \
             patch.object(self.riverboat, 'security_campfire') as mock_security:
            
            mock_unloading.process = AsyncMock(return_value={
                "unpacked": True,
                "files": malicious_party_box["torch"]["attachments"],
                "task": malicious_party_box["torch"]["task"]
            })
            
            mock_security.validate = AsyncMock(return_value={
                "secure": False,
                "reason": "Path traversal attempt detected"
            })
            
            with pytest.raises(Exception) as exc_info:
                await self.riverboat.receive_party_box(malicious_party_box)
            
            assert "security validation" in str(exc_info.value).lower()
    
    async def test_campfire_communication_flow(self):
        """Test communication flow between campfires"""
        test_party_box = {
            "torch": {
                "claim": "review_code",
                "task": "Review this Python code",
                "os": "linux",
                "workspace_root": "/test/workspace",
                "attachments": [
                    {
                        "path": "test.py",
                        "content": "def test(): pass",
                        "type": "text/python",
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
        
        with patch.object(self.riverboat, 'unloading_campfire') as mock_unloading, \
             patch.object(self.riverboat, 'security_campfire') as mock_security, \
             patch.object(self.riverboat, 'devteam_campfire') as mock_devteam, \
             patch.object(self.riverboat, 'offloading_campfire') as mock_offloading:
            
            # Setup mock responses
            mock_unloading.process = AsyncMock(return_value={"unpacked": True})
            mock_security.validate = AsyncMock(return_value={"secure": True})
            mock_devteam.process = AsyncMock(return_value={"review": "Code looks good"})
            mock_offloading.package = AsyncMock(return_value={"torch": {"review": "Code looks good"}})
            
            result = await self.riverboat.receive_party_box(test_party_box)
            
            # Verify all campfires were called in correct order
            mock_unloading.process.assert_called_once()
            mock_security.validate.assert_called_once()
            mock_devteam.process.assert_called_once()
            mock_offloading.package.assert_called_once()
            
            assert "torch" in result


@pytest.mark.asyncio
class TestProcessingCampfires:
    """Test individual processing campfires"""
    
    async def test_unloading_campfire(self):
        """Test unloading campfire Party Box unpacking"""
        unloading = UnloadingCampfire()
        
        party_box = {
            "torch": {
                "claim": "generate_code",
                "task": "Create a function",
                "attachments": [
                    {
                        "path": "test.py",
                        "content": "# existing code",
                        "type": "text/python"
                    }
                ]
            }
        }
        
        result = await unloading.process(party_box)
        
        assert result["unpacked"] == True
        assert "files" in result
        assert "task" in result
        assert result["task"] == "Create a function"
    
    async def test_security_campfire_valid_content(self):
        """Test security campfire with valid content"""
        security = SecurityCampfire()
        
        safe_content = {
            "files": [
                {
                    "path": "src/test.py",
                    "content": "def hello(): print('Hello')"
                }
            ],
            "task": "Create a hello function"
        }
        
        result = await security.validate(safe_content)
        
        assert result["secure"] == True
        assert "validated_content" in result
    
    async def test_security_campfire_malicious_content(self):
        """Test security campfire with malicious content"""
        security = SecurityCampfire()
        
        malicious_content = {
            "files": [
                {
                    "path": "../../../etc/passwd",
                    "content": "malicious content"
                }
            ],
            "task": "Delete system files"
        }
        
        result = await security.validate(malicious_content)
        
        assert result["secure"] == False
        assert "reason" in result
    
    async def test_offloading_campfire(self):
        """Test offloading campfire response packaging"""
        offloading = OffloadingCampfire()
        
        processed_result = {
            "content": "def hello(): print('Hello World')",
            "files_to_create": [
                {"path": "hello.py", "content": "def hello(): print('Hello World')"}
            ],
            "commands_to_execute": ["python hello.py"]
        }
        
        result = await offloading.package(processed_result)
        
        assert "torch" in result
        assert result["torch"]["content"] == processed_result["content"]
        assert result["torch"]["files_to_create"] == processed_result["files_to_create"]
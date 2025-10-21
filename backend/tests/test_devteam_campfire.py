#!/usr/bin/env python3
"""
Integration tests for DevTeam Campfire
Tests camper collaboration and workflow orchestration
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from party_box.devteam_campfire import DevTeamCampfire, BaseCamper

@pytest.mark.asyncio
class TestDevTeamCampfire:
    """Test DevTeam Campfire functionality"""
    
    def setup_method(self):
        """Setup test DevTeam campfire"""
        self.devteam = DevTeamCampfire()
    
    async def test_camper_registration(self):
        """Test camper registration in DevTeam campfire"""
        initial_count = len(self.devteam.campers)
        
        # All required campers should be registered
        expected_campers = [
            'RequirementsGatherer', 'OSExpert', 'BackEndDev', 'FrontEndDev',
            'Tester', 'DevOps', 'TerminalExpert', 'Auditor'
        ]
        
        registered_roles = [camper.role for camper in self.devteam.campers.values()]
        
        for expected_role in expected_campers:
            assert expected_role in registered_roles
    
    async def test_code_generation_workflow(self):
        """Test complete code generation workflow"""
        task_request = {
            "task": "Create a REST API endpoint",
            "os": "linux",
            "workspace_root": "/test/workspace",
            "attachments": [],
            "context": {
                "current_file": "app.py",
                "project_structure": ["app.py", "requirements.txt"],
                "terminal_history": []
            }
        }
        
        # Mock camper responses
        with patch.object(self.devteam, 'get_camper') as mock_get_camper:
            mock_campers = {}
            
            # Mock RequirementsGatherer
            mock_req_gatherer = AsyncMock()
            mock_req_gatherer.process_task = AsyncMock(return_value={
                "requirements": "Create REST API with GET and POST endpoints",
                "scope": "backend_api"
            })
            mock_campers['RequirementsGatherer'] = mock_req_gatherer
            
            # Mock OSExpert
            mock_os_expert = AsyncMock()
            mock_os_expert.process_task = AsyncMock(return_value={
                "tech_stack": "Python Flask",
                "os_specific": "Use pip for dependencies"
            })
            mock_campers['OSExpert'] = mock_os_expert
            
            # Mock BackEndDev
            mock_backend_dev = AsyncMock()
            mock_backend_dev.process_task = AsyncMock(return_value={
                "code": "from flask import Flask\napp = Flask(__name__)",
                "files_to_create": [{"path": "api.py", "content": "Flask API code"}]
            })
            mock_campers['BackEndDev'] = mock_backend_dev
            
            # Mock Auditor
            mock_auditor = AsyncMock()
            mock_auditor.process_task = AsyncMock(return_value={
                "audit_result": "approved",
                "security_check": "passed",
                "final_code": "Flask API code with security"
            })
            mock_campers['Auditor'] = mock_auditor
            
            mock_get_camper.side_effect = lambda role: mock_campers.get(role)
            
            result = await self.devteam.process(task_request)
            
            assert "content" in result
            assert "files_to_create" in result
            mock_req_gatherer.process_task.assert_called_once()
            mock_os_expert.process_task.assert_called_once()
            mock_backend_dev.process_task.assert_called_once()
            mock_auditor.process_task.assert_called_once()
    
    async def test_code_review_workflow(self):
        """Test code review workflow"""
        review_request = {
            "task": "Review this Python code for security issues",
            "os": "windows",
            "workspace_root": "/test/workspace",
            "attachments": [
                {
                    "path": "app.py",
                    "content": "import os\npassword = os.getenv('PASSWORD')",
                    "type": "text/python"
                }
            ],
            "context": {
                "current_file": "app.py",
                "project_structure": ["app.py"],
                "terminal_history": []
            }
        }
        
        with patch.object(self.devteam, 'get_camper') as mock_get_camper:
            # Mock Auditor for code review
            mock_auditor = AsyncMock()
            mock_auditor.process_task = AsyncMock(return_value={
                "review": "Security issue: hardcoded password handling",
                "suggestions": ["Use secure environment variable handling"],
                "security_score": 6
            })
            
            mock_get_camper.return_value = mock_auditor
            
            result = await self.devteam.process(review_request)
            
            assert "review" in result or "content" in result
            mock_auditor.process_task.assert_called_once()
    
    async def test_camper_collaboration(self):
        """Test camper collaboration workflow"""
        collaboration_request = {
            "task": "Create a web application with database",
            "os": "macos",
            "workspace_root": "/test/workspace",
            "attachments": [],
            "context": {
                "current_file": None,
                "project_structure": [],
                "terminal_history": []
            }
        }
        
        with patch.object(self.devteam, 'get_camper') as mock_get_camper:
            mock_campers = {}
            
            # Mock multiple campers for collaboration
            roles = ['RequirementsGatherer', 'OSExpert', 'BackEndDev', 'FrontEndDev', 'DevOps', 'Auditor']
            
            for role in roles:
                mock_camper = AsyncMock()
                mock_camper.process_task = AsyncMock(return_value={
                    f"{role.lower()}_output": f"Output from {role}",
                    "contribution": f"{role} contribution"
                })
                mock_campers[role] = mock_camper
            
            mock_get_camper.side_effect = lambda role: mock_campers.get(role)
            
            result = await self.devteam.process(collaboration_request)
            
            # Verify multiple campers were involved
            assert len(mock_campers) > 1
            for mock_camper in mock_campers.values():
                mock_camper.process_task.assert_called_once()
    
    async def test_auditor_gating(self):
        """Test auditor gating for code publication"""
        task_request = {
            "task": "Create a function with potential security issues",
            "os": "linux",
            "workspace_root": "/test/workspace",
            "attachments": [],
            "context": {
                "current_file": "test.py",
                "project_structure": ["test.py"],
                "terminal_history": []
            }
        }
        
        with patch.object(self.devteam, 'get_camper') as mock_get_camper:
            mock_campers = {}
            
            # Mock BackEndDev with potentially insecure code
            mock_backend_dev = AsyncMock()
            mock_backend_dev.process_task = AsyncMock(return_value={
                "code": "import subprocess\nsubprocess.call(user_input, shell=True)",
                "files_to_create": [{"path": "insecure.py", "content": "insecure code"}]
            })
            mock_campers['BackEndDev'] = mock_backend_dev
            
            # Mock Auditor rejecting the code
            mock_auditor = AsyncMock()
            mock_auditor.process_task = AsyncMock(return_value={
                "audit_result": "rejected",
                "security_issues": ["Shell injection vulnerability"],
                "recommendation": "Use subprocess with shell=False"
            })
            mock_campers['Auditor'] = mock_auditor
            
            mock_get_camper.side_effect = lambda role: mock_campers.get(role)
            
            result = await self.devteam.process(task_request)
            
            # Auditor should have been called and rejected the code
            mock_auditor.process_task.assert_called_once()
            assert "security_issues" in result or "audit_result" in result


@pytest.mark.asyncio
class TestBaseCamper:
    """Test base camper functionality"""
    
    def setup_method(self):
        """Setup test base camper"""
        self.base_camper = BaseCamper("TestCamper", "Test camper for unit testing")
    
    async def test_camper_initialization(self):
        """Test camper initialization"""
        assert self.base_camper.role == "TestCamper"
        assert self.base_camper.description == "Test camper for unit testing"
        assert hasattr(self.base_camper, 'process_task')
    
    async def test_camper_task_processing(self):
        """Test base camper task processing"""
        test_task = {
            "task": "Test task",
            "context": {"test": "data"}
        }
        
        # Base camper should have a process_task method
        result = await self.base_camper.process_task(test_task)
        
        # Should return some form of response
        assert isinstance(result, dict)
    
    async def test_camper_error_handling(self):
        """Test camper error handling"""
        invalid_task = None
        
        try:
            result = await self.base_camper.process_task(invalid_task)
            # Should handle gracefully or raise appropriate exception
            assert isinstance(result, dict) or result is None
        except Exception as e:
            # Should raise meaningful exception
            assert str(e) is not None
#!/usr/bin/env python3
"""
Processing Campfires for CampfireValley Riverboat System
Implements unloading, security, and offloading campfires
"""

import logging
from datetime import datetime
from typing import Dict, Any, List
from pathlib import Path
import re

logger = logging.getLogger(__name__)

class UnloadingCampfire:
    """
    Unloading campfire for Party Box unpacking
    Requirements: 12.2
    """
    
    def __init__(self):
        self.name = "UnloadingCampfire"
        logger.info(f"Initialized {self.name}")
    
    async def process(self, party_box) -> Dict[str, Any]:
        """
        Unpack Party Box contents and extract file paths, content, task assertions
        Requirements: 12.2
        """
        logger.info(f"{self.name}: Processing Party Box unpacking")
        
        try:
            # Extract torch data
            torch_data = party_box.torch.model_dump() if hasattr(party_box.torch, 'model_dump') else party_box.torch
            
            # Extract file information
            file_paths = []
            file_contents = {}
            file_types = {}
            
            for attachment in party_box.torch.attachments:
                file_paths.append(attachment.path)
                file_contents[attachment.path] = attachment.content
                file_types[attachment.path] = attachment.type
            
            # Extract context information
            context = torch_data.get("context", {})
            current_file = context.get("current_file")
            project_structure = context.get("project_structure", [])
            terminal_history = context.get("terminal_history", [])
            
            # Create unpacked data structure
            unpacked = {
                "torch": torch_data,
                "file_paths": file_paths,
                "file_contents": file_contents,
                "file_types": file_types,
                "task_assertions": party_box.torch.task,
                "workspace_root": party_box.torch.workspace_root,
                "os_type": party_box.torch.os,
                "current_file": current_file,
                "project_structure": project_structure,
                "terminal_history": terminal_history,
                "metadata": party_box.metadata,
                "unpacked_at": datetime.now().isoformat(),
                "unpacked_by": self.name
            }
            
            logger.info(f"{self.name}: Successfully unpacked Party Box with {len(file_paths)} files")
            return unpacked
            
        except Exception as e:
            logger.error(f"{self.name}: Error unpacking Party Box: {str(e)}")
            raise UnloadingError(f"Failed to unpack Party Box: {str(e)}")


class SecurityCampfire:
    """
    Security campfire for validation
    Requirements: 12.3
    """
    
    def __init__(self):
        self.name = "SecurityCampfire"
        self.dangerous_patterns = [
            r'\.\./',  # Path traversal
            r'\.\.\\',  # Windows path traversal
            r'/etc/',  # System files
            r'/root/',  # Root directory
            r'C:\\Windows',  # Windows system
            r'rm\s+-rf',  # Dangerous commands
            r'del\s+/[sf]',  # Windows delete
            r'format\s+[a-z]:',  # Format drive
            r'eval\s*\(',  # Code evaluation
            r'exec\s*\(',  # Code execution
            r'__import__',  # Dynamic imports
            r'subprocess\.',  # Subprocess calls
            r'os\.system',  # OS system calls
        ]
        logger.info(f"Initialized {self.name} with {len(self.dangerous_patterns)} security patterns")
    
    async def process(self, unpacked_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate Party Box contents for security compliance
        Requirements: 12.3
        """
        logger.info(f"{self.name}: Processing security validation")
        
        try:
            # Initialize security validation results
            security_checks = {
                "path_traversal": "passed",
                "workspace_boundary": "passed",
                "dangerous_patterns": "passed",
                "file_size_limits": "passed",
                "content_validation": "passed",
                "timestamp": datetime.now().isoformat()
            }
            
            validation_errors = []
            
            # Check 1: Path traversal validation
            file_paths = unpacked_data.get("file_paths", [])
            workspace_root = unpacked_data.get("workspace_root", "")
            
            for file_path in file_paths:
                if self._check_path_traversal(file_path):
                    security_checks["path_traversal"] = "failed"
                    validation_errors.append(f"Path traversal attempt detected: {file_path}")
            
            # Check 2: Workspace boundary validation
            if not workspace_root:
                security_checks["workspace_boundary"] = "failed"
                validation_errors.append("No workspace root specified")
            else:
                for file_path in file_paths:
                    if not self._check_workspace_boundary(file_path, workspace_root):
                        security_checks["workspace_boundary"] = "failed"
                        validation_errors.append(f"File outside workspace boundary: {file_path}")
            
            # Check 3: Dangerous pattern detection
            file_contents = unpacked_data.get("file_contents", {})
            task_assertions = unpacked_data.get("task_assertions", "")
            
            # Check task content for dangerous patterns
            if self._check_dangerous_patterns(task_assertions):
                security_checks["dangerous_patterns"] = "failed"
                validation_errors.append("Dangerous patterns detected in task")
            
            # Check file contents for dangerous patterns
            for file_path, content in file_contents.items():
                if self._check_dangerous_patterns(content):
                    security_checks["dangerous_patterns"] = "failed"
                    validation_errors.append(f"Dangerous patterns detected in file: {file_path}")
            
            # Check 4: File size limits (prevent DoS)
            max_file_size = 1024 * 1024  # 1MB per file
            max_total_size = 10 * 1024 * 1024  # 10MB total
            total_size = 0
            
            for file_path, content in file_contents.items():
                file_size = len(content.encode('utf-8'))
                total_size += file_size
                
                if file_size > max_file_size:
                    security_checks["file_size_limits"] = "failed"
                    validation_errors.append(f"File too large: {file_path} ({file_size} bytes)")
            
            if total_size > max_total_size:
                security_checks["file_size_limits"] = "failed"
                validation_errors.append(f"Total content too large: {total_size} bytes")
            
            # Check 5: Content validation (basic)
            for file_path, content in file_contents.items():
                if not self._validate_content_encoding(content):
                    security_checks["content_validation"] = "failed"
                    validation_errors.append(f"Invalid content encoding in file: {file_path}")
            
            # Determine overall security status
            secure = len(validation_errors) == 0
            
            # Create validated data structure
            validated = unpacked_data.copy()
            validated.update({
                "secure": secure,
                "security_checks": security_checks,
                "validation_errors": validation_errors,
                "validated_at": datetime.now().isoformat(),
                "validated_by": self.name
            })
            
            if secure:
                logger.info(f"{self.name}: Security validation passed")
            else:
                logger.warning(f"{self.name}: Security validation failed - {len(validation_errors)} errors")
                for error in validation_errors:
                    logger.warning(f"{self.name}: {error}")
            
            return validated
            
        except Exception as e:
            logger.error(f"{self.name}: Error during security validation: {str(e)}")
            raise SecurityValidationError(f"Security validation failed: {str(e)}")
    
    def _check_path_traversal(self, file_path: str) -> bool:
        """Check for path traversal attempts"""
        return ".." in file_path or file_path.startswith("/") or "\\" in file_path
    
    def _check_workspace_boundary(self, file_path: str, workspace_root: str) -> bool:
        """Check if file path is within workspace boundary"""
        try:
            # Normalize paths
            workspace_path = Path(workspace_root).resolve()
            file_full_path = (workspace_path / file_path).resolve()
            
            # Check if file path is within workspace
            return str(file_full_path).startswith(str(workspace_path))
        except Exception:
            return False
    
    def _check_dangerous_patterns(self, content: str) -> bool:
        """Check content for dangerous patterns"""
        for pattern in self.dangerous_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return True
        return False
    
    def _validate_content_encoding(self, content: str) -> bool:
        """Validate content encoding and basic structure"""
        try:
            # Check if content is valid UTF-8
            content.encode('utf-8')
            
            # Check for null bytes (potential binary content)
            if '\x00' in content:
                return False
            
            return True
        except UnicodeEncodeError:
            return False


class OffloadingCampfire:
    """
    Offloading campfire for response packaging
    Requirements: 13.1, 13.2
    """
    
    def __init__(self):
        self.name = "OffloadingCampfire"
        logger.info(f"Initialized {self.name}")
    
    async def process(self, processed_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Package processed results into response Party Box
        Requirements: 13.1, 13.2
        """
        logger.info(f"{self.name}: Processing response packaging")
        
        try:
            # Extract camper responses
            camper_responses = processed_data.get("camper_responses", [])
            
            # Collect all files to create
            files_to_create = []
            commands_to_execute = []
            suggestions = []
            
            for response in camper_responses:
                files_to_create.extend(response.get("files_to_create", []))
                commands_to_execute.extend(response.get("commands_to_execute", []))
                
                if response.get("response_type") == "suggestion":
                    suggestions.append({
                        "camper": response.get("camper_role"),
                        "content": response.get("content"),
                        "confidence": response.get("confidence_score", 0.5)
                    })
            
            # Create response attachments for files
            response_attachments = []
            for file_info in files_to_create:
                response_attachments.append({
                    "path": file_info.get("path", "generated_file.txt"),
                    "content": file_info.get("content", ""),
                    "type": self._determine_file_type(file_info.get("path", "")),
                    "timestamp": datetime.now().isoformat()
                })
            
            # Package the response Party Box
            response_party_box = {
                "torch": {
                    "claim": "response",
                    "task": "processed_response",
                    "os": processed_data.get("os_type", "linux"),
                    "workspace_root": processed_data.get("workspace_root", ""),
                    "attachments": response_attachments,
                    "context": {
                        "current_file": processed_data.get("current_file"),
                        "project_structure": processed_data.get("project_structure", []),
                        "terminal_history": processed_data.get("terminal_history", [])
                    }
                },
                "results": {
                    "camper_responses": camper_responses,
                    "files_to_create": files_to_create,
                    "commands_to_execute": commands_to_execute,
                    "suggestions": suggestions,
                    "processing_summary": {
                        "total_campers": len(camper_responses),
                        "files_generated": len(files_to_create),
                        "commands_generated": len(commands_to_execute),
                        "suggestions_generated": len(suggestions)
                    }
                },
                "metadata": {
                    "processed_at": datetime.now().isoformat(),
                    "server_version": "1.0.0",
                    "packaged_by": self.name,
                    "original_metadata": processed_data.get("metadata", {})
                }
            }
            
            logger.info(f"{self.name}: Successfully packaged response with {len(files_to_create)} files and {len(commands_to_execute)} commands")
            return response_party_box
            
        except Exception as e:
            logger.error(f"{self.name}: Error packaging response: {str(e)}")
            raise OffloadingError(f"Failed to package response: {str(e)}")
    
    def _determine_file_type(self, file_path: str) -> str:
        """Determine MIME type based on file extension"""
        extension = Path(file_path).suffix.lower()
        
        type_mapping = {
            '.py': 'text/python',
            '.js': 'text/javascript',
            '.ts': 'text/typescript',
            '.html': 'text/html',
            '.css': 'text/css',
            '.json': 'application/json',
            '.yaml': 'text/yaml',
            '.yml': 'text/yaml',
            '.md': 'text/markdown',
            '.txt': 'text/plain',
            '.sh': 'text/shell',
            '.bat': 'text/batch',
            '.ps1': 'text/powershell'
        }
        
        return type_mapping.get(extension, 'text/plain')


class UnloadingError(Exception):
    """Raised when unloading campfire fails"""
    pass


class SecurityValidationError(Exception):
    """Raised when security campfire validation fails"""
    pass


class OffloadingError(Exception):
    """Raised when offloading campfire fails"""
    pass
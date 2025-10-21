#!/usr/bin/env python3
"""
Processing Campfires for CampfireValley Riverboat System
Implements unloading, security, and offloading campfires with comprehensive error handling
Requirements: 12.2, 12.3, 12.7, 13.1, 13.2, 13.7
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path
import re
import hashlib
import json

from .error_handler import (
    error_handler, 
    SecurityValidationError, 
    PartyBoxValidationError, 
    RiverboatProcessingError,
    ErrorType,
    ErrorSeverity
)

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
    Enhanced Security campfire for comprehensive validation
    Requirements: 12.3, 12.7, 13.7
    """
    
    def __init__(self):
        self.name = "SecurityCampfire"
        self.validation_rules = self._initialize_security_rules()
        self.max_file_size = 10 * 1024 * 1024  # 10MB per file
        self.max_total_size = 50 * 1024 * 1024  # 50MB total
        self.max_files = 100  # Maximum number of files
        self.allowed_file_extensions = {
            '.py', '.js', '.ts', '.html', '.css', '.json', '.yaml', '.yml', 
            '.md', '.txt', '.sh', '.bat', '.ps1', '.sql', '.xml', '.csv'
        }
        logger.info(f"Initialized {self.name} with comprehensive security validation")

    def _initialize_security_rules(self) -> Dict[str, List[str]]:
        """Initialize comprehensive security validation rules"""
        return {
            "path_traversal": [
                r'\.\./',  # Unix path traversal
                r'\.\.\\',  # Windows path traversal
                r'\.\.%2f',  # URL encoded path traversal
                r'\.\.%5c',  # URL encoded Windows path traversal
            ],
            "system_paths": [
                r'/etc/',  # Unix system files
                r'/root/',  # Root directory
                r'/proc/',  # Process information
                r'/sys/',  # System information
                r'C:\\Windows',  # Windows system
                r'C:\\Program Files',  # Windows programs
                r'C:\\Users\\[^/\\]+\\AppData',  # Windows user data
            ],
            "dangerous_commands": [
                r'rm\s+-rf',  # Dangerous delete
                r'del\s+/[sf]',  # Windows delete
                r'format\s+[a-z]:',  # Format drive
                r'mkfs\.',  # Make filesystem
                r'dd\s+if=',  # Disk dump
                r'sudo\s+',  # Sudo commands
                r'chmod\s+777',  # Dangerous permissions
            ],
            "code_injection": [
                r'eval\s*\(',  # Code evaluation
                r'exec\s*\(',  # Code execution
                r'__import__',  # Dynamic imports
                r'subprocess\.',  # Subprocess calls
                r'os\.system',  # OS system calls
                r'shell=True',  # Shell execution
                r'popen\(',  # Process opening
                r'execv?p?\(',  # Execute variants
            ],
            "network_access": [
                r'urllib\.request',  # URL requests
                r'requests\.',  # HTTP requests
                r'socket\.',  # Socket operations
                r'http\.client',  # HTTP client
                r'ftplib\.',  # FTP operations
                r'smtplib\.',  # SMTP operations
            ],
            "file_system": [
                r'open\s*\([^)]*["\'][/\\]',  # Absolute path file operations
                r'with\s+open\s*\([^)]*["\'][/\\]',  # Absolute path context manager
                r'shutil\.',  # File utilities
                r'tempfile\.',  # Temporary files
                r'glob\.',  # File globbing
            ],
            "sensitive_data": [
                r'password\s*=',  # Password assignments
                r'api_key\s*=',  # API key assignments
                r'secret\s*=',  # Secret assignments
                r'token\s*=',  # Token assignments
                r'-----BEGIN\s+PRIVATE\s+KEY-----',  # Private keys
                r'-----BEGIN\s+RSA\s+PRIVATE\s+KEY-----',  # RSA private keys
            ]
        }
    
    async def process(self, unpacked_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Comprehensive security validation for Party Box contents
        Requirements: 12.3, 12.7, 13.7
        """
        logger.info(f"{self.name}: Processing comprehensive security validation")
        
        try:
            # Initialize comprehensive security validation results
            security_checks = {
                "path_traversal": {"status": "passed", "details": []},
                "workspace_boundary": {"status": "passed", "details": []},
                "dangerous_patterns": {"status": "passed", "details": []},
                "file_size_limits": {"status": "passed", "details": []},
                "content_validation": {"status": "passed", "details": []},
                "file_type_validation": {"status": "passed", "details": []},
                "content_analysis": {"status": "passed", "details": []},
                "rate_limiting": {"status": "passed", "details": []},
                "timestamp": datetime.now().isoformat()
            }
            
            validation_errors = []
            security_warnings = []
            
            # Extract data for validation
            file_paths = unpacked_data.get("file_paths", [])
            file_contents = unpacked_data.get("file_contents", {})
            file_types = unpacked_data.get("file_types", {})
            workspace_root = unpacked_data.get("workspace_root", "")
            task_assertions = unpacked_data.get("task_assertions", "")
            
            # Validation 1: Path traversal and injection attacks
            path_traversal_results = await self._validate_path_traversal(file_paths)
            if not path_traversal_results["passed"]:
                security_checks["path_traversal"]["status"] = "failed"
                security_checks["path_traversal"]["details"] = path_traversal_results["errors"]
                validation_errors.extend(path_traversal_results["errors"])
            
            # Validation 2: Workspace boundary enforcement
            boundary_results = await self._validate_workspace_boundary(file_paths, workspace_root)
            if not boundary_results["passed"]:
                security_checks["workspace_boundary"]["status"] = "failed"
                security_checks["workspace_boundary"]["details"] = boundary_results["errors"]
                validation_errors.extend(boundary_results["errors"])
            
            # Validation 3: File size and count limits
            size_results = await self._validate_file_sizes(file_contents)
            if not size_results["passed"]:
                security_checks["file_size_limits"]["status"] = "failed"
                security_checks["file_size_limits"]["details"] = size_results["errors"]
                validation_errors.extend(size_results["errors"])
            
            # Validation 4: File type validation
            type_results = await self._validate_file_types(file_paths, file_types)
            if not type_results["passed"]:
                security_checks["file_type_validation"]["status"] = "failed"
                security_checks["file_type_validation"]["details"] = type_results["errors"]
                validation_errors.extend(type_results["errors"])
            
            # Validation 5: Content encoding and structure validation
            content_results = await self._validate_content_structure(file_contents)
            if not content_results["passed"]:
                security_checks["content_validation"]["status"] = "failed"
                security_checks["content_validation"]["details"] = content_results["errors"]
                validation_errors.extend(content_results["errors"])
            
            # Validation 6: Dangerous pattern detection
            pattern_results = await self._validate_dangerous_patterns(file_contents, task_assertions)
            if not pattern_results["passed"]:
                security_checks["dangerous_patterns"]["status"] = "failed"
                security_checks["dangerous_patterns"]["details"] = pattern_results["errors"]
                validation_errors.extend(pattern_results["errors"])
            
            # Add warnings to security checks
            if pattern_results.get("warnings"):
                security_warnings.extend(pattern_results["warnings"])
            
            # Validation 7: Content analysis for suspicious behavior
            analysis_results = await self._analyze_content_behavior(file_contents, task_assertions)
            if not analysis_results["passed"]:
                security_checks["content_analysis"]["status"] = "failed"
                security_checks["content_analysis"]["details"] = analysis_results["errors"]
                validation_errors.extend(analysis_results["errors"])
            
            # Validation 8: Rate limiting and abuse prevention
            rate_limit_results = await self._check_rate_limits(unpacked_data)
            if not rate_limit_results["passed"]:
                security_checks["rate_limiting"]["status"] = "failed"
                security_checks["rate_limiting"]["details"] = rate_limit_results["errors"]
                validation_errors.extend(rate_limit_results["errors"])
            
            # Determine overall security status
            secure = len(validation_errors) == 0
            
            # Generate security hash for tracking
            security_hash = self._generate_security_hash(unpacked_data)
            
            # Create comprehensive validated data structure
            validated = unpacked_data.copy()
            validated.update({
                "secure": secure,
                "security_checks": security_checks,
                "validation_errors": validation_errors,
                "security_warnings": security_warnings,
                "security_hash": security_hash,
                "security_level": self._determine_security_level(security_checks),
                "validated_at": datetime.now().isoformat(),
                "validated_by": self.name,
                "validation_version": "2.0"
            })
            
            # Log results
            if secure:
                logger.info(f"{self.name}: Security validation passed with {len(security_warnings)} warnings")
                if security_warnings:
                    for warning in security_warnings:
                        logger.warning(f"{self.name}: Warning - {warning}")
            else:
                logger.error(f"{self.name}: Security validation failed - {len(validation_errors)} errors")
                for error in validation_errors:
                    logger.error(f"{self.name}: Error - {error}")
                
                # Create detailed security error
                security_error = error_handler.handle_security_validation_error(
                    "comprehensive_validation",
                    f"Security validation failed with {len(validation_errors)} errors",
                    {
                        "validation_errors": validation_errors,
                        "security_warnings": security_warnings,
                        "security_checks": security_checks,
                        "security_hash": security_hash
                    }
                )
                
                # Raise security validation error
                raise SecurityValidationError(
                    security_error.technical_message,
                    "comprehensive_validation",
                    security_error.details
                )
            
            return validated
            
        except SecurityValidationError:
            raise
        except Exception as e:
            logger.error(f"{self.name}: Unexpected error during security validation: {str(e)}")
            processing_error = error_handler.handle_processing_error(
                self.name,
                "security_validation",
                e,
                {"unpacked_data_keys": list(unpacked_data.keys()) if unpacked_data else []}
            )
            raise RiverboatProcessingError(
                processing_error.technical_message,
                self.name,
                "security_validation",
                e
            )
    
    async def _validate_path_traversal(self, file_paths: List[str]) -> Dict[str, Any]:
        """Comprehensive path traversal validation"""
        errors = []
        
        for file_path in file_paths:
            # Check for various path traversal patterns
            for pattern in self.validation_rules["path_traversal"]:
                if re.search(pattern, file_path, re.IGNORECASE):
                    errors.append(f"Path traversal attempt detected in: {file_path}")
                    break
            
            # Check for absolute paths
            if file_path.startswith('/') or (len(file_path) > 1 and file_path[1] == ':'):
                errors.append(f"Absolute path not allowed: {file_path}")
            
            # Check for null bytes
            if '\x00' in file_path:
                errors.append(f"Null byte in path: {file_path}")
        
        return {"passed": len(errors) == 0, "errors": errors}
    
    async def _validate_workspace_boundary(self, file_paths: List[str], workspace_root: str) -> Dict[str, Any]:
        """Validate workspace boundary enforcement"""
        errors = []
        
        if not workspace_root:
            errors.append("No workspace root specified")
            return {"passed": False, "errors": errors}
        
        try:
            workspace_path = Path(workspace_root).resolve()
        except Exception as e:
            errors.append(f"Invalid workspace root: {workspace_root} - {str(e)}")
            return {"passed": False, "errors": errors}
        
        for file_path in file_paths:
            try:
                # Normalize and resolve the file path
                file_full_path = (workspace_path / file_path).resolve()
                
                # Check if file path is within workspace
                if not str(file_full_path).startswith(str(workspace_path)):
                    errors.append(f"File outside workspace boundary: {file_path}")
                
                # Additional check for symbolic link attacks
                if file_full_path.is_symlink():
                    link_target = file_full_path.readlink()
                    if link_target.is_absolute() or '..' in str(link_target):
                        errors.append(f"Suspicious symbolic link: {file_path}")
                        
            except Exception as e:
                errors.append(f"Path validation error for {file_path}: {str(e)}")
        
        return {"passed": len(errors) == 0, "errors": errors}
    
    async def _validate_file_sizes(self, file_contents: Dict[str, str]) -> Dict[str, Any]:
        """Validate file sizes and count limits"""
        errors = []
        total_size = 0
        
        # Check file count limit
        if len(file_contents) > self.max_files:
            errors.append(f"Too many files: {len(file_contents)} (max: {self.max_files})")
        
        # Check individual file sizes and total size
        for file_path, content in file_contents.items():
            try:
                file_size = len(content.encode('utf-8'))
                total_size += file_size
                
                if file_size > self.max_file_size:
                    errors.append(f"File too large: {file_path} ({file_size} bytes, max: {self.max_file_size})")
                
                # Check for suspiciously small files that might be placeholders
                if file_size == 0:
                    errors.append(f"Empty file detected: {file_path}")
                    
            except Exception as e:
                errors.append(f"Size validation error for {file_path}: {str(e)}")
        
        if total_size > self.max_total_size:
            errors.append(f"Total content too large: {total_size} bytes (max: {self.max_total_size})")
        
        return {"passed": len(errors) == 0, "errors": errors}
    
    async def _validate_file_types(self, file_paths: List[str], file_types: Dict[str, str]) -> Dict[str, Any]:
        """Validate file types and extensions"""
        errors = []
        
        for file_path in file_paths:
            # Check file extension
            file_ext = Path(file_path).suffix.lower()
            
            if file_ext and file_ext not in self.allowed_file_extensions:
                errors.append(f"Disallowed file extension: {file_path} ({file_ext})")
            
            # Validate MIME type consistency
            declared_type = file_types.get(file_path, "")
            if declared_type and not self._is_consistent_file_type(file_ext, declared_type):
                errors.append(f"Inconsistent file type: {file_path} (ext: {file_ext}, type: {declared_type})")
        
        return {"passed": len(errors) == 0, "errors": errors}
    
    async def _validate_content_structure(self, file_contents: Dict[str, str]) -> Dict[str, Any]:
        """Validate content encoding and structure"""
        errors = []
        
        for file_path, content in file_contents.items():
            try:
                # Check if content is valid UTF-8
                content.encode('utf-8')
                
                # Check for null bytes (potential binary content)
                if '\x00' in content:
                    errors.append(f"Binary content detected in: {file_path}")
                
                # Check for extremely long lines (potential DoS)
                lines = content.split('\n')
                for i, line in enumerate(lines):
                    if len(line) > 10000:  # 10KB per line
                        errors.append(f"Extremely long line in {file_path} at line {i+1}")
                        break
                
                # Check for excessive line count
                if len(lines) > 50000:  # 50K lines
                    errors.append(f"Too many lines in {file_path}: {len(lines)}")
                
            except UnicodeEncodeError as e:
                errors.append(f"Invalid UTF-8 encoding in {file_path}: {str(e)}")
            except Exception as e:
                errors.append(f"Content validation error for {file_path}: {str(e)}")
        
        return {"passed": len(errors) == 0, "errors": errors}
    
    async def _validate_dangerous_patterns(self, file_contents: Dict[str, str], task_assertions: str) -> Dict[str, Any]:
        """Comprehensive dangerous pattern detection"""
        errors = []
        warnings = []
        
        # Check task assertions
        task_violations = self._check_content_for_patterns(task_assertions, "task")
        errors.extend(task_violations["errors"])
        warnings.extend(task_violations["warnings"])
        
        # Check file contents
        for file_path, content in file_contents.items():
            content_violations = self._check_content_for_patterns(content, file_path)
            errors.extend(content_violations["errors"])
            warnings.extend(content_violations["warnings"])
        
        return {"passed": len(errors) == 0, "errors": errors, "warnings": warnings}
    
    async def _analyze_content_behavior(self, file_contents: Dict[str, str], task_assertions: str) -> Dict[str, Any]:
        """Analyze content for suspicious behavioral patterns"""
        errors = []
        
        # Analyze task for suspicious requests
        suspicious_task_patterns = [
            r'delete\s+all',
            r'drop\s+table',
            r'format\s+drive',
            r'install\s+malware',
            r'bypass\s+security',
            r'disable\s+antivirus'
        ]
        
        for pattern in suspicious_task_patterns:
            if re.search(pattern, task_assertions, re.IGNORECASE):
                errors.append(f"Suspicious task request detected: {pattern}")
        
        # Analyze code for obfuscation attempts
        for file_path, content in file_contents.items():
            # Check for base64 encoded content (potential obfuscation)
            base64_pattern = r'[A-Za-z0-9+/]{50,}={0,2}'
            if re.search(base64_pattern, content):
                # Verify it's not just a legitimate base64 string
                base64_matches = re.findall(base64_pattern, content)
                if len(base64_matches) > 3:  # Multiple base64 strings might be suspicious
                    errors.append(f"Potential obfuscated content in {file_path}")
            
            # Check for hex encoded content
            hex_pattern = r'\\x[0-9a-fA-F]{2}'
            if len(re.findall(hex_pattern, content)) > 20:
                errors.append(f"Potential hex-encoded content in {file_path}")
        
        return {"passed": len(errors) == 0, "errors": errors}
    
    async def _check_rate_limits(self, unpacked_data: Dict[str, Any]) -> Dict[str, Any]:
        """Check for rate limiting and abuse prevention"""
        errors = []
        
        # This would typically check against a rate limiting store
        # For now, we'll do basic checks
        
        # Check for repeated identical requests (potential spam)
        request_hash = self._generate_security_hash(unpacked_data)
        
        # In a real implementation, you would check this hash against a cache/database
        # and track request frequency per client/IP
        
        return {"passed": len(errors) == 0, "errors": errors}
    
    def _check_content_for_patterns(self, content: str, source: str) -> Dict[str, Any]:
        """Check content against all dangerous pattern categories"""
        errors = []
        warnings = []
        
        for category, patterns in self.validation_rules.items():
            for pattern in patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                if matches:
                    if category in ["code_injection", "system_paths", "dangerous_commands"]:
                        errors.append(f"Dangerous {category} pattern in {source}: {pattern}")
                    elif category in ["network_access", "file_system"]:
                        warnings.append(f"Potentially risky {category} pattern in {source}: {pattern}")
                    elif category == "sensitive_data":
                        errors.append(f"Sensitive data pattern detected in {source}")
        
        return {"errors": errors, "warnings": warnings}
    
    def _is_consistent_file_type(self, file_ext: str, declared_type: str) -> bool:
        """Check if file extension is consistent with declared MIME type"""
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
            '.txt': 'text/plain'
        }
        
        expected_type = type_mapping.get(file_ext, 'text/plain')
        return declared_type.startswith(expected_type.split('/')[0])
    
    def _generate_security_hash(self, data: Dict[str, Any]) -> str:
        """Generate a hash for security tracking"""
        # Create a deterministic hash of the security-relevant data
        security_data = {
            "file_paths": data.get("file_paths", []),
            "task_assertions": data.get("task_assertions", ""),
            "workspace_root": data.get("workspace_root", ""),
            "file_count": len(data.get("file_contents", {}))
        }
        
        data_str = json.dumps(security_data, sort_keys=True)
        return hashlib.sha256(data_str.encode()).hexdigest()[:16]
    
    def _determine_security_level(self, security_checks: Dict[str, Any]) -> str:
        """Determine overall security level based on checks"""
        failed_checks = [
            check for check, result in security_checks.items() 
            if isinstance(result, dict) and result.get("status") == "failed"
        ]
        
        critical_checks = ["path_traversal", "workspace_boundary", "dangerous_patterns"]
        
        if any(check in critical_checks for check in failed_checks):
            return "critical_failure"
        elif len(failed_checks) > 2:
            return "high_risk"
        elif len(failed_checks) > 0:
            return "medium_risk"
        else:
            return "secure"


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
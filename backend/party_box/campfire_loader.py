#!/usr/bin/env python3
"""
Generic Campfire Loader for CampfireValley
Dynamically loads and configures campfires based on manifest files
"""

import os
import yaml
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Type
from pathlib import Path
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class BaseCamper(ABC):
    """
    Base camper interface for all dynamically loaded campers
    """
    
    def __init__(self, role: str, config: Dict[str, Any], ollama_client):
        self.role = role
        self.config = config
        self.ollama_client = ollama_client
        self.prompt_template = config.get('promptTemplate', '')
        self.system_prompt = config.get('systemPrompt', '')
        self.confidence_threshold = config.get('confidenceThreshold', 0.7)
        self.max_response_length = config.get('maxResponseLength', 2000)
        self.specializations = config.get('specializations', [])
        
        logger.info(f"Initialized {self.role} camper with specializations: {self.specializations}")
    
    @abstractmethod
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Process a task and return camper response"""
        pass
    
    async def generate_response(self, prompt: str, system_prompt: str = None, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Generate response using Ollama client with context awareness"""
        try:
            # Enhance prompt with context from previous campers if available
            enhanced_prompt = self._enhance_prompt_with_context(prompt, context)
            
            # Use configured system prompt if not provided
            if not system_prompt:
                system_prompt = self.system_prompt
            
            response = await self.ollama_client.generate_response(
                model=self.config.get('model', 'codellama:7b'),
                prompt=enhanced_prompt,
                system_prompt=system_prompt
            )
            return response
        except Exception as e:
            logger.error(f"{self.role}: Error generating response: {str(e)}")
            return {"error": str(e)}
    
    def _enhance_prompt_with_context(self, prompt: str, context: Dict[str, Any] = None) -> str:
        """Enhance prompt with context from previous camper responses"""
        if not context or not context.get("previous_responses"):
            return prompt
        
        context_parts = [prompt, "\n--- CONTEXT FROM PREVIOUS CAMPERS ---"]
        
        for prev_response in context.get("previous_responses", []):
            camper_role = prev_response.get("camper_role", "Unknown")
            content = prev_response.get("content", "")
            
            # Add relevant context based on specializations
            if self._is_relevant_context(camper_role, prev_response):
                context_parts.append(f"\n{camper_role} Output: {content[:200]}...")
        
        context_parts.append("\n--- END CONTEXT ---\n")
        return "\n".join(context_parts)
    
    def _is_relevant_context(self, camper_role: str, response: Dict[str, Any]) -> bool:
        """Determine if previous camper response is relevant to this camper"""
        # Basic relevance logic - can be enhanced based on specializations
        response_type = response.get("response_type", "")
        
        # Code-related campers benefit from requirements and architecture context
        if "code" in self.specializations and camper_role in ["RequirementsGatherer", "OSExpert"]:
            return True
        
        # Testing campers benefit from code generation context
        if "testing" in self.specializations and response_type == "code":
            return True
        
        # Auditor benefits from all previous responses
        if "security_analysis" in self.specializations or "code_quality_review" in self.specializations:
            return True
        
        return False
    
    def format_response(self, content: str, response_type: str = "suggestion", 
                       files_to_create: List[Dict[str, str]] = None,
                       commands_to_execute: List[str] = None,
                       confidence_score: float = None) -> Dict[str, Any]:
        """Format camper response in standard structure"""
        return {
            "camper_role": self.role,
            "response_type": response_type,
            "content": content,
            "files_to_create": files_to_create or [],
            "commands_to_execute": commands_to_execute or [],
            "confidence_score": confidence_score or self.confidence_threshold,
            "specializations": self.specializations
        }


class GenericCamper(BaseCamper):
    """
    Generic camper implementation that can be configured for any role
    """
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Process task based on configuration"""
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        # Format prompt using template
        prompt = self.prompt_template.format(task=task, os=os_type)
        
        response = await self.generate_response(prompt, self.system_prompt, context)
        
        if "error" in response:
            return self.format_response(
                f"Error in {self.role}: {response['error']}", 
                confidence_score=0.1
            )
        
        content = response.get("response", "")
        
        # Determine response type based on specializations
        response_type = self._determine_response_type()
        
        # Extract files and commands based on configuration
        files_to_create = []
        commands_to_execute = []
        
        if self.config.get("codeGeneration", {}).get("enabled", False):
            files_to_create = self._extract_code_blocks(content)
        
        if self.config.get("commandGeneration", {}).get("enabled", False):
            commands_to_execute = self._extract_commands(content, os_type)
        
        return self.format_response(
            content, 
            response_type, 
            files_to_create, 
            commands_to_execute,
            confidence_score=self.confidence_threshold
        )
    
    def _determine_response_type(self) -> str:
        """Determine response type based on specializations"""
        if any(spec in ["api_development", "ui_development", "infrastructure_as_code"] 
               for spec in self.specializations):
            return "code"
        elif any(spec in ["command_line_operations", "debugging_commands"] 
                 for spec in self.specializations):
            return "command"
        else:
            return "suggestion"
    
    def _extract_code_blocks(self, text: str) -> List[Dict[str, str]]:
        """Extract code blocks from response text"""
        files = []
        lines = text.split('\n')
        current_file = None
        current_content = []
        in_code_block = False
        
        for line in lines:
            if line.strip().startswith('```'):
                if in_code_block:
                    # End of code block
                    if current_file:
                        files.append({
                            "path": current_file,
                            "content": '\n'.join(current_content)
                        })
                    current_file = None
                    current_content = []
                    in_code_block = False
                else:
                    # Start of code block
                    in_code_block = True
                    # Check if filename is specified
                    if len(line.strip()) > 3:
                        potential_filename = line.strip()[3:].strip()
                        if '.' in potential_filename:
                            current_file = potential_filename
            elif in_code_block:
                current_content.append(line)
            elif line.strip().startswith('# File:') or line.strip().startswith('// File:'):
                # Alternative file specification
                current_file = line.split(':', 1)[1].strip()
        
        # If no files extracted but code generation is enabled, create default file
        if not files and current_content:
            default_ext = self.config.get("codeGeneration", {}).get("defaultFileExtension", ".txt")
            files.append({
                "path": f"{self.role.lower()}_output{default_ext}",
                "content": '\n'.join(current_content)
            })
        
        return files
    
    def _extract_commands(self, text: str, os_type: str) -> List[str]:
        """Extract executable commands from response text"""
        commands = []
        lines = text.split('\n')
        max_commands = self.config.get("commandGeneration", {}).get("maxCommands", 5)
        
        for line in lines:
            line = line.strip()
            # Look for command-like patterns based on OS
            if os_type.lower() == "windows":
                if line.startswith(('>', 'cmd>', 'PS>', 'powershell>')):
                    commands.append(line.split('>', 1)[-1].strip())
                elif line.startswith(('dir ', 'cd ', 'copy ', 'del ', 'mkdir ', 'docker ', 'python ', 'pip ')):
                    commands.append(line)
            else:
                if line.startswith(('$ ', '# ', 'bash>', 'sh>')):
                    commands.append(line.split(' ', 1)[-1].strip())
                elif line.startswith(('ls ', 'cd ', 'cp ', 'rm ', 'mkdir ', 'docker ', 'python ', 'pip ')):
                    commands.append(line)
            
            if len(commands) >= max_commands:
                break
        
        return commands


class CampfireLoader:
    """
    Generic campfire loader that creates campfires from manifest configurations
    """
    
    def __init__(self, manifest_path: Path, ollama_client):
        self.manifest_path = manifest_path
        self.ollama_client = ollama_client
        self.manifest_config = None
        self.campfire = None
        
    async def load_campfire(self) -> 'GenericCampfire':
        """Load campfire from manifest configuration"""
        try:
            # Load manifest file
            self.manifest_config = await self._load_manifest()
            
            # Create generic campfire
            self.campfire = GenericCampfire(self.manifest_config, self.ollama_client)
            
            logger.info(f"Loaded campfire: {self.campfire.name} with {len(self.campfire.campers)} campers")
            return self.campfire
            
        except Exception as e:
            logger.error(f"Failed to load campfire from {self.manifest_path}: {str(e)}")
            raise
    
    async def _load_manifest(self) -> Dict[str, Any]:
        """Load and validate manifest file"""
        if not self.manifest_path.exists():
            raise FileNotFoundError(f"Manifest file not found: {self.manifest_path}")
        
        try:
            with open(self.manifest_path, 'r') as f:
                if self.manifest_path.suffix.lower() in ['.yaml', '.yml']:
                    config = yaml.safe_load(f)
                else:
                    config = json.load(f)
            
            # Validate required fields
            required_fields = ['apiVersion', 'kind', 'metadata', 'spec']
            for field in required_fields:
                if field not in config:
                    raise ValueError(f"Missing required field in manifest: {field}")
            
            if config['kind'] != 'CampfireManifest':
                raise ValueError(f"Invalid manifest kind: {config['kind']}")
            
            return config
            
        except Exception as e:
            logger.error(f"Error loading manifest: {str(e)}")
            raise


class GenericCampfire:
    """
    Generic campfire that can be configured from manifest files
    """
    
    def __init__(self, manifest_config: Dict[str, Any], ollama_client):
        self.manifest_config = manifest_config
        self.ollama_client = ollama_client
        
        # Extract campfire metadata
        self.name = manifest_config['spec']['campfire']['name']
        self.campfire_type = manifest_config['spec']['campfire']['type']
        self.max_concurrent_tasks = manifest_config['spec']['campfire'].get('maxConcurrentTasks', 5)
        self.response_timeout = manifest_config['spec']['campfire'].get('responseTimeout', 30000)
        
        # Initialize campers from configuration
        self.campers = {}
        self._initialize_campers()
        
        # Load workflows
        self.workflows = manifest_config['spec'].get('workflows', {})
        
        # Load security configuration
        self.security_config = manifest_config['spec'].get('security', {})
        
        logger.info(f"Initialized {self.name} campfire with {len(self.campers)} campers")
    
    def _initialize_campers(self):
        """Initialize campers from manifest configuration"""
        camper_configs = self.manifest_config['spec'].get('campers', [])
        
        for camper_config in camper_configs:
            role = camper_config['role']
            
            # Create generic camper with configuration
            camper = GenericCamper(role, camper_config, self.ollama_client)
            self.campers[role] = camper
            
            logger.info(f"Initialized {role} camper with specializations: {camper.specializations}")
    
    async def process(self, validated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process validated Party Box through configured campfire workflow
        """
        logger.info(f"{self.name}: Processing validated Party Box")
        
        try:
            torch_data = validated_data.get("torch", {})
            claim = torch_data.get("claim", "")
            
            # Determine workflow based on claim
            workflow = self._get_workflow_for_claim(claim)
            
            if not workflow:
                # Fallback to basic processing
                return await self._process_basic_workflow(torch_data, validated_data)
            
            # Execute configured workflow
            return await self._execute_workflow(workflow, torch_data, validated_data)
            
        except Exception as e:
            logger.error(f"{self.name}: Error processing Party Box: {str(e)}")
            raise
    
    def _get_workflow_for_claim(self, claim: str) -> Optional[Dict[str, Any]]:
        """Get workflow configuration for claim type"""
        return self.workflows.get(claim)
    
    async def _execute_workflow(self, workflow: Dict[str, Any], torch_data: Dict[str, Any], validated_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute configured workflow sequence"""
        sequence = workflow.get('sequence', [])
        parallel_execution = workflow.get('parallelExecution', False)
        audit_gate = workflow.get('auditGate', False)
        
        camper_responses = []
        context = {"previous_responses": []}
        
        logger.info(f"Executing workflow with sequence: {sequence}")
        
        if parallel_execution:
            # Execute campers in parallel (not implemented in this version)
            logger.warning("Parallel execution not yet implemented, falling back to sequential")
        
        # Sequential execution
        for camper_role in sequence:
            if camper_role in self.campers:
                logger.info(f"Processing with {camper_role}")
                response = await self.campers[camper_role].process_task(torch_data, context)
                camper_responses.append(response)
                context["previous_responses"].append(response)
            else:
                logger.warning(f"Unknown camper role in workflow: {camper_role}")
        
        # Apply audit gate if configured
        if audit_gate and "Auditor" in self.campers:
            audit_result = await self._apply_audit_gate(camper_responses)
            if not audit_result.get("approved", True):
                logger.warning("Audit gate blocked publication")
                # Mark responses as blocked
                for response in camper_responses:
                    if response.get("response_type") == "code":
                        response["publication_blocked"] = True
                        response["block_reason"] = "Failed audit gate verification"
        
        # Add workflow metadata
        workflow_metadata = {
            "workflow_type": workflow.get('description', 'Unknown'),
            "campers_involved": [resp.get("camper_role") for resp in camper_responses],
            "collaboration_steps": len(camper_responses),
            "audit_gate_status": "PASSED" if not audit_gate or audit_result.get("approved", True) else "BLOCKED"
        }
        
        return {
            "camper_responses": camper_responses,
            "workflow_metadata": workflow_metadata
        }
    
    async def _process_basic_workflow(self, torch_data: Dict[str, Any], validated_data: Dict[str, Any]) -> Dict[str, Any]:
        """Basic fallback workflow when no specific workflow is configured"""
        claim = torch_data.get("claim", "")
        
        # Use first available camper or RequirementsGatherer as fallback
        camper_role = "RequirementsGatherer" if "RequirementsGatherer" in self.campers else list(self.campers.keys())[0]
        
        if camper_role in self.campers:
            response = await self.campers[camper_role].process_task(torch_data)
            return {
                "camper_responses": [response],
                "workflow_metadata": {
                    "workflow_type": "basic_fallback",
                    "campers_involved": [camper_role],
                    "collaboration_steps": 1
                }
            }
        
        # No campers available
        return {
            "camper_responses": [{
                "camper_role": "System",
                "response_type": "error",
                "content": "No campers available for processing",
                "confidence_score": 0.0
            }],
            "workflow_metadata": {
                "workflow_type": "error",
                "campers_involved": [],
                "collaboration_steps": 0
            }
        }
    
    async def _apply_audit_gate(self, camper_responses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Apply audit gate validation if Auditor camper is available"""
        if "Auditor" not in self.campers:
            return {"approved": True, "reason": "No auditor available"}
        
        auditor = self.campers["Auditor"]
        
        # Check if auditor has gatekeeper capability
        if not auditor.config.get("auditing", {}).get("gatekeeper", False):
            return {"approved": True, "reason": "Auditor not configured as gatekeeper"}
        
        # Perform audit validation (simplified version)
        issues = []
        
        for response in camper_responses:
            confidence = response.get("confidence_score", 0)
            if confidence < 0.7:
                issues.append(f"{response.get('camper_role', 'Unknown')}: Low confidence score ({confidence:.2f})")
        
        # Check for security patterns if enabled
        if self.security_config.get("enableSecurityValidation", False):
            dangerous_patterns = self.security_config.get("dangerousPatterns", [])
            
            for response in camper_responses:
                if response.get("response_type") == "code":
                    files = response.get("files_to_create", [])
                    for file_info in files:
                        content = file_info.get("content", "").lower()
                        for pattern in dangerous_patterns:
                            if pattern.lower() in content:
                                issues.append(f"Dangerous pattern detected: {pattern}")
        
        approved = len(issues) == 0
        
        return {
            "approved": approved,
            "issues": issues,
            "audit_summary": f"Audit gate {'PASSED' if approved else 'BLOCKED'}: {len(issues)} issues identified"
        }
    
    def get_camper_by_role(self, role: str) -> Optional[BaseCamper]:
        """Get a specific camper by role name"""
        return self.campers.get(role)
    
    def get_all_camper_roles(self) -> List[str]:
        """Get list of all available camper roles"""
        return list(self.campers.keys())


class CampfireRegistry:
    """
    Registry for managing multiple campfires loaded from different manifests
    """
    
    def __init__(self, manifests_directory: Path, ollama_client):
        self.manifests_directory = manifests_directory
        self.ollama_client = ollama_client
        self.campfires = {}
        
    async def load_all_campfires(self):
        """Load all campfires from manifest files in the directory"""
        if not self.manifests_directory.exists():
            logger.warning(f"Manifests directory does not exist: {self.manifests_directory}")
            return
        
        manifest_files = list(self.manifests_directory.glob("*.yaml")) + list(self.manifests_directory.glob("*.yml"))
        
        for manifest_file in manifest_files:
            try:
                loader = CampfireLoader(manifest_file, self.ollama_client)
                campfire = await loader.load_campfire()
                self.campfires[campfire.name] = campfire
                logger.info(f"Loaded campfire: {campfire.name}")
            except Exception as e:
                logger.error(f"Failed to load campfire from {manifest_file}: {str(e)}")
    
    def get_campfire(self, name: str) -> Optional['GenericCampfire']:
        """Get campfire by name"""
        return self.campfires.get(name)
    
    def get_default_campfire(self) -> Optional['GenericCampfire']:
        """Get the first available campfire as default"""
        if self.campfires:
            return list(self.campfires.values())[0]
        return None
    
    def list_campfires(self) -> List[str]:
        """List all available campfire names"""
        return list(self.campfires.keys())
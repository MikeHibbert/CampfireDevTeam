#!/usr/bin/env python3
"""
DevTeam Campfire for CampfireValley
Implementation with specialized campers and base camper interface
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class BaseCamper(ABC):
    """
    Base camper interface providing common functionality for all specialized campers
    """
    
    def __init__(self, role: str, ollama_client, prompt_template: str = None):
        self.role = role
        self.ollama_client = ollama_client
        self.prompt_template = prompt_template or self._get_default_prompt_template()
        self.confidence_threshold = 0.7
        logger.info(f"Initialized {self.role} camper")
    
    @abstractmethod
    def _get_default_prompt_template(self) -> str:
        """Get the default prompt template for this camper type"""
        pass
    
    @abstractmethod
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Process a task and return camper response"""
        pass
    
    async def generate_response(self, prompt: str, system_prompt: str = None, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Generate response using Ollama client with context awareness"""
        try:
            # Enhance prompt with context from previous campers if available
            enhanced_prompt = self._enhance_prompt_with_context(prompt, context)
            
            response = await self.ollama_client.generate_response(
                model="codellama:7b",  # Default model
                prompt=enhanced_prompt,
                system_prompt=system_prompt or f"You are an expert {self.role} in a development team."
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
            
            # Add relevant context based on camper role
            if camper_role == "RequirementsGatherer" and self.role != "RequirementsGatherer":
                context_parts.append(f"\nRequirements Analysis: {content[:200]}...")
            elif camper_role == "OSExpert" and self.role in ["BackEndDev", "FrontEndDev", "DevOps", "TerminalExpert"]:
                context_parts.append(f"\nTechnology Stack Recommendations: {content[:200]}...")
            elif camper_role in ["BackEndDev", "FrontEndDev"] and self.role == "Tester":
                context_parts.append(f"\nCode to Test ({camper_role}): {content[:300]}...")
            elif self.role == "Auditor":
                context_parts.append(f"\n{camper_role} Output: {content[:150]}...")
        
        context_parts.append("\n--- END CONTEXT ---\n")
        return "\n".join(context_parts)
    
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
            "confidence_score": confidence_score or self.confidence_threshold
        }
    
    def extract_code_blocks(self, text: str) -> List[Dict[str, str]]:
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
        
        return files

class RequirementsGathererCamper(BaseCamper):
    """Camper specialized in analyzing tasks and determining scope"""
    
    def _get_default_prompt_template(self) -> str:
        return "Analyze task '{task}' on {os}. Determine scope, requirements, and suggest implementation approach."
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        prompt = self.prompt_template.format(task=task, os=os_type)
        system_prompt = "You are an expert requirements analyst. Provide clear, actionable requirements and scope analysis."
        
        response = await self.generate_response(prompt, system_prompt, context)
        
        if "error" in response:
            return self.format_response(f"Error analyzing requirements: {response['error']}", confidence_score=0.1)
        
        content = response.get("response", "")
        return self.format_response(content, "suggestion", confidence_score=0.8)


class OSExpertCamper(BaseCamper):
    """Camper specialized in OS-specific recommendations and technology stack"""
    
    def _get_default_prompt_template(self) -> str:
        return "Recommend technology stack and OS-specific considerations for '{task}' on {os} system."
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        prompt = self.prompt_template.format(task=task, os=os_type)
        system_prompt = f"You are an expert in {os_type} systems and technology stacks. Provide specific, actionable recommendations."
        
        response = await self.generate_response(prompt, system_prompt, context)
        
        if "error" in response:
            return self.format_response(f"Error generating OS recommendations: {response['error']}", confidence_score=0.1)
        
        content = response.get("response", "")
        return self.format_response(content, "suggestion", confidence_score=0.8)


class BackEndDevCamper(BaseCamper):
    """Camper specialized in backend/server-side code generation"""
    
    def _get_default_prompt_template(self) -> str:
        return "Generate backend/server-side code for '{task}' on {os}. Focus on API endpoints, data models, and business logic."
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        prompt = self.prompt_template.format(task=task, os=os_type)
        system_prompt = "You are an expert backend developer. Generate clean, production-ready server-side code with proper error handling."
        
        response = await self.generate_response(prompt, system_prompt, context)
        
        if "error" in response:
            return self.format_response(f"Error generating backend code: {response['error']}", confidence_score=0.1)
        
        content = response.get("response", "")
        files = self.extract_code_blocks(content)
        
        # If no files extracted, create a default backend file
        if not files and content.strip():
            files = [{"path": "backend_code.py", "content": content}]
        
        return self.format_response(content, "code", files_to_create=files, confidence_score=0.8)


class FrontEndDevCamper(BaseCamper):
    """Camper specialized in frontend/client-side code generation"""
    
    def _get_default_prompt_template(self) -> str:
        return "Generate frontend/client-side code for '{task}' on {os}. Focus on user interface, user experience, and client-side logic."
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        prompt = self.prompt_template.format(task=task, os=os_type)
        system_prompt = "You are an expert frontend developer. Generate modern, responsive client-side code with good UX practices."
        
        response = await self.generate_response(prompt, system_prompt, context)
        
        if "error" in response:
            return self.format_response(f"Error generating frontend code: {response['error']}", confidence_score=0.1)
        
        content = response.get("response", "")
        files = self.extract_code_blocks(content)
        
        # If no files extracted, create default frontend files
        if not files and content.strip():
            files = [{"path": "frontend_code.html", "content": content}]
        
        return self.format_response(content, "code", files_to_create=files, confidence_score=0.8)


class TesterCamper(BaseCamper):
    """Camper specialized in creating test cases and testing strategies"""
    
    def _get_default_prompt_template(self) -> str:
        return "Create comprehensive test cases for '{task}' on {os}. Include unit tests, integration tests, and testing strategy."
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        prompt = self.prompt_template.format(task=task, os=os_type)
        system_prompt = "You are an expert QA engineer and test developer. Create thorough, maintainable test suites."
        
        response = await self.generate_response(prompt, system_prompt, context)
        
        if "error" in response:
            return self.format_response(f"Error generating tests: {response['error']}", confidence_score=0.1)
        
        content = response.get("response", "")
        files = self.extract_code_blocks(content)
        
        # If no files extracted, create a default test file
        if not files and content.strip():
            files = [{"path": "test_code.py", "content": content}]
        
        return self.format_response(content, "code", files_to_create=files, confidence_score=0.8)


class DevOpsCamper(BaseCamper):
    """Camper specialized in deployment scripts and DevOps practices"""
    
    def _get_default_prompt_template(self) -> str:
        return "Create deployment scripts and DevOps configuration for '{task}' on {os}. Include Docker, CI/CD, and infrastructure setup."
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        prompt = self.prompt_template.format(task=task, os=os_type)
        system_prompt = "You are an expert DevOps engineer. Create robust, scalable deployment and infrastructure solutions."
        
        response = await self.generate_response(prompt, system_prompt, context)
        
        if "error" in response:
            return self.format_response(f"Error generating DevOps scripts: {response['error']}", confidence_score=0.1)
        
        content = response.get("response", "")
        files = self.extract_code_blocks(content)
        
        # If no files extracted, create default DevOps files
        if not files and content.strip():
            files = [{"path": "Dockerfile", "content": content}]
        
        return self.format_response(content, "code", files_to_create=files, confidence_score=0.8)


class TerminalExpertCamper(BaseCamper):
    """Camper specialized in OS-specific terminal commands and debugging"""
    
    def _get_default_prompt_template(self) -> str:
        return "Provide {os}-specific terminal commands for '{task}'. Include debugging, log checking, Docker operations, and Python execution commands."
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        prompt = self.prompt_template.format(task=task, os=os_type)
        system_prompt = f"You are an expert in {os_type} terminal operations. Provide safe, effective commands with explanations."
        
        response = await self.generate_response(prompt, system_prompt, context)
        
        if "error" in response:
            return self.format_response(f"Error generating terminal commands: {response['error']}", confidence_score=0.1)
        
        content = response.get("response", "")
        commands = self._extract_commands_from_response(content, os_type)
        
        return self.format_response(content, "command", commands_to_execute=commands, confidence_score=0.8)
    
    def _extract_commands_from_response(self, response_text: str, os_type: str) -> List[str]:
        """Extract executable commands from AI response"""
        commands = []
        lines = response_text.split('\n')
        
        for line in lines:
            line = line.strip()
            # Look for command-like patterns
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
        
        return commands[:5]  # Limit to 5 commands for safety


class AuditorCamper(BaseCamper):
    """Camper specialized in code review, security, and quality verification"""
    
    def _get_default_prompt_template(self) -> str:
        return "Audit and review code for '{task}' on {os}. Check security vulnerabilities, syntax, code coverage, and best practices."
    
    async def process_task(self, torch_data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        task = torch_data.get("task", "")
        os_type = torch_data.get("os", "linux")
        
        prompt = self.prompt_template.format(task=task, os=os_type)
        system_prompt = "You are an expert code auditor and security reviewer. Provide detailed, actionable feedback on code quality and security."
        
        response = await self.generate_response(prompt, system_prompt, context)
        
        if "error" in response:
            return self.format_response(f"Error performing audit: {response['error']}", confidence_score=0.1)
        
        content = response.get("response", "")
        return self.format_response(content, "suggestion", confidence_score=0.9)
    
    def verify_code_quality(self, camper_responses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Comprehensive verification of code quality from all camper responses
        Implements requirement 6.7: verify all generated code for security, syntax, and coverage
        """
        issues = []
        approved = True
        security_checks = []
        syntax_checks = []
        coverage_checks = []
        
        for response in camper_responses:
            camper_role = response.get("camper_role", "Unknown")
            confidence = response.get("confidence_score", 0)
            response_type = response.get("response_type", "unknown")
            
            # Check confidence threshold
            if confidence < 0.7:
                issues.append(f"{camper_role}: Low confidence score ({confidence:.2f})")
                approved = False
            
            # Security checks for code responses
            if response_type == "code":
                files = response.get("files_to_create", [])
                for file_info in files:
                    file_path = file_info.get("path", "unknown")
                    content = file_info.get("content", "")
                    
                    # Syntax check: ensure non-empty content
                    if not content.strip():
                        issues.append(f"Empty code file: {file_path}")
                        syntax_checks.append(f"{file_path}: Empty file")
                        approved = False
                    
                    # Basic security checks
                    security_issues = self._check_security_vulnerabilities(content, file_path)
                    if security_issues:
                        issues.extend(security_issues)
                        security_checks.extend(security_issues)
                        approved = False
                    
                    # Basic syntax validation
                    syntax_issues = self._check_basic_syntax(content, file_path)
                    if syntax_issues:
                        issues.extend(syntax_issues)
                        syntax_checks.extend(syntax_issues)
                        approved = False
            
            # Check command safety for terminal responses
            elif response_type == "command":
                commands = response.get("commands_to_execute", [])
                unsafe_commands = self._check_command_safety(commands)
                if unsafe_commands:
                    issues.extend(unsafe_commands)
                    security_checks.extend(unsafe_commands)
                    approved = False
        
        # Coverage check: ensure essential campers provided responses
        camper_roles = [resp.get("camper_role") for resp in camper_responses]
        essential_campers = ["RequirementsGatherer", "OSExpert"]
        
        for essential in essential_campers:
            if essential not in camper_roles:
                issues.append(f"Missing essential camper response: {essential}")
                coverage_checks.append(f"Missing {essential} analysis")
                approved = False
        
        return {
            "approved": approved,
            "issues": issues,
            "security_checks": security_checks,
            "syntax_checks": syntax_checks,
            "coverage_checks": coverage_checks,
            "audit_summary": f"Comprehensive audit completed. {'APPROVED' if approved else 'BLOCKED'}: {len(issues)} issues identified."
        }
    
    def _check_security_vulnerabilities(self, content: str, file_path: str) -> List[str]:
        """Check for basic security vulnerabilities in code"""
        issues = []
        content_lower = content.lower()
        
        # Check for potential security issues
        security_patterns = [
            ("eval(", "Potential code injection via eval()"),
            ("exec(", "Potential code injection via exec()"),
            ("os.system(", "Direct system command execution"),
            ("subprocess.call(", "System command execution without validation"),
            ("input(", "Unvalidated user input"),
            ("raw_input(", "Unvalidated user input"),
            ("pickle.loads(", "Unsafe deserialization"),
            ("yaml.load(", "Unsafe YAML loading"),
            ("shell=true", "Shell injection vulnerability")
        ]
        
        for pattern, description in security_patterns:
            if pattern in content_lower:
                issues.append(f"{file_path}: {description}")
        
        return issues
    
    def _check_basic_syntax(self, content: str, file_path: str) -> List[str]:
        """Perform basic syntax validation"""
        issues = []
        
        # Check for basic syntax issues
        if file_path.endswith('.py'):
            # Basic Python syntax checks
            lines = content.split('\n')
            for i, line in enumerate(lines, 1):
                stripped = line.strip()
                if stripped:
                    # Check for unmatched brackets/parentheses (basic check)
                    open_brackets = stripped.count('(') + stripped.count('[') + stripped.count('{')
                    close_brackets = stripped.count(')') + stripped.count(']') + stripped.count('}')
                    if abs(open_brackets - close_brackets) > 2:  # Allow some flexibility
                        issues.append(f"{file_path}:{i}: Potential bracket mismatch")
        
        elif file_path.endswith(('.js', '.ts')):
            # Basic JavaScript/TypeScript checks
            if content.count('{') != content.count('}'):
                issues.append(f"{file_path}: Unmatched curly braces")
        
        return issues
    
    def _check_command_safety(self, commands: List[str]) -> List[str]:
        """Check terminal commands for safety"""
        issues = []
        
        dangerous_commands = [
            "rm -rf /",
            "del /f /s /q",
            "format",
            "fdisk",
            "dd if=",
            ":(){ :|:& };:",  # Fork bomb
            "sudo rm",
            "chmod 777"
        ]
        
        for cmd in commands:
            cmd_lower = cmd.lower().strip()
            for dangerous in dangerous_commands:
                if dangerous in cmd_lower:
                    issues.append(f"Dangerous command detected: {cmd}")
                    break
        
        return issues


class DevTeamCampfire:
    """
    DevTeam campfire with eight specialized campers for comprehensive development assistance
    """
    
    def __init__(self, ollama_client):
        self.name = "DevTeamCampfire"
        self.ollama_client = ollama_client
        
        # Initialize all eight specialized campers
        self.campers = {
            "RequirementsGatherer": RequirementsGathererCamper("RequirementsGatherer", ollama_client),
            "OSExpert": OSExpertCamper("OSExpert", ollama_client),
            "BackEndDev": BackEndDevCamper("BackEndDev", ollama_client),
            "FrontEndDev": FrontEndDevCamper("FrontEndDev", ollama_client),
            "Tester": TesterCamper("Tester", ollama_client),
            "DevOps": DevOpsCamper("DevOps", ollama_client),
            "TerminalExpert": TerminalExpertCamper("TerminalExpert", ollama_client),
            "Auditor": AuditorCamper("Auditor", ollama_client)
        }
        
        logger.info(f"Initialized {self.name} with {len(self.campers)} specialized campers")
    
    async def process(self, validated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process validated Party Box through DevTeam campfire with specialized campers
        """
        logger.info(f"{self.name}: Processing validated Party Box with specialized campers")
        
        try:
            torch_data = validated_data.get("torch", {})
            task = torch_data.get("task", "")
            claim = torch_data.get("claim", "")
            os_type = torch_data.get("os", "linux")
            
            # Check Ollama availability
            ollama_available = await self.ollama_client.health_check()
            
            if ollama_available:
                # Use specialized campers for processing
                response = await self._process_with_specialized_campers(torch_data, validated_data)
            else:
                # Fallback to mock responses
                logger.warning("Ollama not available, using fallback responses")
                response = await self._process_with_fallback(claim, task, os_type)
            
            # Add processing metadata
            response.update({
                "processed_at": datetime.now().isoformat(),
                "processed_by": self.name,
                "ollama_available": ollama_available,
                "original_data": validated_data
            })
            
            logger.info(f"{self.name}: Successfully processed Party Box")
            return response
            
        except Exception as e:
            logger.error(f"{self.name}: Error processing Party Box: {str(e)}")
            raise DevTeamProcessingError(f"DevTeam processing failed: {str(e)}")
    
    async def _process_with_specialized_campers(self, torch_data: Dict[str, Any], validated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process request using specialized campers with proper collaboration workflow
        Implements requirements 6.1-6.7 for camper collaboration and auditor gating
        """
        claim = torch_data.get("claim", "")
        camper_responses = []
        context = {"previous_responses": []}
        
        # Step 1: RequirementsGatherer analyzes task and determines scope (Requirement 6.1)
        logger.info("Step 1: RequirementsGatherer analyzing task scope")
        req_response = await self.campers["RequirementsGatherer"].process_task(torch_data, context)
        camper_responses.append(req_response)
        context["previous_responses"].append(req_response)
        
        # Step 2: OSExpert recommends technology stack based on system environment (Requirement 6.2)
        logger.info("Step 2: OSExpert recommending technology stack")
        os_response = await self.campers["OSExpert"].process_task(torch_data, context)
        camper_responses.append(os_response)
        context["previous_responses"].append(os_response)
        
        # Step 3: Process based on claim type with specialized campers
        if claim == "generate_code":
            logger.info("Processing code generation workflow")
            
            # Step 3a: BackEndDev generates server-side code (Requirement 6.3)
            logger.info("Step 3a: BackEndDev generating server-side code")
            backend_response = await self.campers["BackEndDev"].process_task(torch_data, context)
            camper_responses.append(backend_response)
            context["previous_responses"].append(backend_response)
            
            # Step 3b: FrontEndDev generates client-side code (Requirement 6.3)
            logger.info("Step 3b: FrontEndDev generating client-side code")
            frontend_response = await self.campers["FrontEndDev"].process_task(torch_data, context)
            camper_responses.append(frontend_response)
            context["previous_responses"].append(frontend_response)
            
            # Step 3c: Tester creates test cases for generated code (Requirement 6.4)
            logger.info("Step 3c: Tester creating test cases")
            test_response = await self.campers["Tester"].process_task(torch_data, context)
            camper_responses.append(test_response)
            context["previous_responses"].append(test_response)
            
            # Step 3d: DevOps provides deployment scripts when applicable (Requirement 6.5)
            logger.info("Step 3d: DevOps creating deployment scripts")
            devops_response = await self.campers["DevOps"].process_task(torch_data, context)
            camper_responses.append(devops_response)
            context["previous_responses"].append(devops_response)
            
            # Step 3e: TerminalExpert suggests OS-specific commands (Requirement 6.6)
            logger.info("Step 3e: TerminalExpert suggesting commands")
            terminal_response = await self.campers["TerminalExpert"].process_task(torch_data, context)
            camper_responses.append(terminal_response)
            context["previous_responses"].append(terminal_response)
            
        elif claim == "review_code":
            logger.info("Processing code review workflow")
            # Direct to auditor for comprehensive review
            audit_response = await self.campers["Auditor"].process_task(torch_data, context)
            camper_responses.append(audit_response)
            context["previous_responses"].append(audit_response)
            
        elif claim == "execute_command":
            logger.info("Processing command execution workflow")
            # Focus on terminal commands with OS expert input
            terminal_response = await self.campers["TerminalExpert"].process_task(torch_data, context)
            camper_responses.append(terminal_response)
            context["previous_responses"].append(terminal_response)
        
        # Step 4: Auditor verification and gating (Requirement 6.7)
        # Auditor verifies all generated code for security, syntax, and coverage before publication
        if claim != "review_code":  # Avoid duplicate auditor calls
            logger.info("Step 4: Auditor performing final verification and gating")
            auditor = self.campers["Auditor"]
            
            # Perform comprehensive audit of all camper responses
            audit_result = auditor.verify_code_quality(camper_responses)
            
            # Create detailed audit response
            audit_content = self._create_audit_summary(audit_result, camper_responses)
            audit_summary_response = auditor.format_response(
                audit_content,
                "suggestion",
                confidence_score=0.9 if audit_result["approved"] else 0.3
            )
            
            # Add gating information
            audit_summary_response["audit_gate"] = {
                "approved": audit_result["approved"],
                "gate_status": "PASSED" if audit_result["approved"] else "BLOCKED",
                "issues_count": len(audit_result["issues"]),
                "publication_allowed": audit_result["approved"]
            }
            
            camper_responses.append(audit_summary_response)
            
            # If audit fails, mark all code responses as blocked
            if not audit_result["approved"]:
                logger.warning("Auditor gate BLOCKED - code publication not allowed")
                for response in camper_responses:
                    if response.get("response_type") == "code":
                        response["publication_blocked"] = True
                        response["block_reason"] = "Failed auditor gate verification"
            else:
                logger.info("Auditor gate PASSED - code approved for publication")
        
        # Add collaboration metadata
        collaboration_metadata = {
            "workflow_type": claim,
            "campers_involved": [resp.get("camper_role") for resp in camper_responses],
            "collaboration_steps": len(camper_responses),
            "audit_gate_status": "PASSED" if claim == "review_code" or audit_result.get("approved", False) else "BLOCKED"
        }
        
        return {
            "camper_responses": camper_responses,
            "collaboration_metadata": collaboration_metadata
        }
    
    def _create_audit_summary(self, audit_result: Dict[str, Any], camper_responses: List[Dict[str, Any]]) -> str:
        """Create comprehensive audit summary for all camper responses"""
        summary_parts = [
            f"=== AUDITOR GATE VERIFICATION ===",
            f"Status: {'PASSED' if audit_result['approved'] else 'BLOCKED'}",
            f"Issues Found: {len(audit_result['issues'])}",
            f"Campers Reviewed: {len(camper_responses)}",
            ""
        ]
        
        if audit_result["issues"]:
            summary_parts.append("ISSUES IDENTIFIED:")
            for issue in audit_result["issues"]:
                summary_parts.append(f"- {issue}")
            summary_parts.append("")
        
        # Add detailed review of each camper's contribution
        summary_parts.append("CAMPER REVIEW SUMMARY:")
        for response in camper_responses:
            role = response.get("camper_role", "Unknown")
            confidence = response.get("confidence_score", 0)
            response_type = response.get("response_type", "unknown")
            
            status = "✓ APPROVED" if confidence >= 0.7 else "⚠ NEEDS REVIEW"
            summary_parts.append(f"- {role}: {status} (confidence: {confidence:.1f}, type: {response_type})")
        
        summary_parts.append("")
        summary_parts.append("RECOMMENDATION:")
        if audit_result["approved"]:
            summary_parts.append("All code and suggestions have passed security and quality checks.")
            summary_parts.append("Publication is APPROVED.")
        else:
            summary_parts.append("Code has failed quality or security checks.")
            summary_parts.append("Publication is BLOCKED until issues are resolved.")
        
        return "\n".join(summary_parts)
    
    def get_camper_by_role(self, role: str) -> Optional[BaseCamper]:
        """Get a specific camper by role name"""
        return self.campers.get(role)
    
    def get_all_camper_roles(self) -> List[str]:
        """Get list of all available camper roles"""
        return list(self.campers.keys())
    
    async def process_collaborative_task(self, torch_data: Dict[str, Any], camper_sequence: List[str]) -> Dict[str, Any]:
        """
        Process a task with a custom sequence of campers for specialized workflows
        """
        camper_responses = []
        context = {"previous_responses": []}
        
        for camper_role in camper_sequence:
            if camper_role in self.campers:
                logger.info(f"Processing with {camper_role}")
                response = await self.campers[camper_role].process_task(torch_data, context)
                camper_responses.append(response)
                context["previous_responses"].append(response)
            else:
                logger.warning(f"Unknown camper role requested: {camper_role}")
        
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
    



class DevTeamProcessingError(Exception):
    """Raised when DevTeam campfire processing fails"""
    pass
#!/usr/bin/env python3
"""
DevTeam Campfire for CampfireValley
Basic implementation for riverboat system integration
"""

import logging
from datetime import datetime
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class DevTeamCampfire:
    """
    DevTeam campfire for processing validated Party Boxes
    This is a basic implementation that will be enhanced in task 11
    """
    
    def __init__(self, ollama_client):
        self.name = "DevTeamCampfire"
        self.ollama_client = ollama_client
        logger.info(f"Initialized {self.name}")
    
    async def process(self, validated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process validated Party Box through DevTeam campfire
        Basic implementation - will be enhanced with specialized campers in task 11
        """
        logger.info(f"{self.name}: Processing validated Party Box")
        
        try:
            torch_data = validated_data.get("torch", {})
            task = torch_data.get("task", "")
            claim = torch_data.get("claim", "")
            os_type = torch_data.get("os", "linux")
            
            # Check Ollama availability
            ollama_available = await self.ollama_client.health_check()
            
            if ollama_available:
                # Use Ollama for AI processing
                response = await self._process_with_ollama(claim, task, os_type, validated_data)
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
    
    async def _process_with_ollama(self, claim: str, task: str, os_type: str, validated_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process request using Ollama AI models"""
        camper_responses = []
        
        # Define camper prompts based on claim type
        if claim == "generate_code":
            # BackEndDev camper
            backend_prompt = f"""You are a BackEndDev camper in CampfireValley. Generate backend code for the following task:
Task: {task}
OS: {os_type}

Provide clean, production-ready code with proper error handling and documentation.
Focus on backend functionality and best practices."""
            
            backend_response = await self.ollama_client.generate_response(
                model="codellama:7b",  # Default model, can be configured
                prompt=backend_prompt,
                system_prompt="You are an expert backend developer. Provide concise, working code solutions."
            )
            
            if "error" not in backend_response:
                camper_responses.append({
                    "camper_role": "BackEndDev",
                    "response_type": "code",
                    "content": backend_response.get("response", ""),
                    "files_to_create": [{"path": "generated_backend.py", "content": backend_response.get("response", "")}],
                    "commands_to_execute": [],
                    "confidence_score": 0.8
                })
        
        elif claim == "review_code":
            # Auditor camper
            auditor_prompt = f"""You are an Auditor camper in CampfireValley. Review the following code task:
Task: {task}
OS: {os_type}

Provide a comprehensive code review focusing on:
- Security vulnerabilities
- Code quality and best practices
- Performance considerations
- Maintainability
- Testing recommendations"""
            
            auditor_response = await self.ollama_client.generate_response(
                model="codellama:7b",
                prompt=auditor_prompt,
                system_prompt="You are an expert code auditor. Provide detailed, actionable feedback."
            )
            
            if "error" not in auditor_response:
                camper_responses.append({
                    "camper_role": "Auditor",
                    "response_type": "suggestion",
                    "content": auditor_response.get("response", ""),
                    "files_to_create": [],
                    "commands_to_execute": [],
                    "confidence_score": 0.9
                })
        
        elif claim == "execute_command":
            # TerminalExpert camper
            terminal_prompt = f"""You are a TerminalExpert camper in CampfireValley. Provide terminal commands for:
Task: {task}
OS: {os_type}

Provide appropriate {os_type}-specific commands for:
- Debugging
- Log checking
- Docker operations
- Python execution
- Development workflow

Format as executable commands with explanations."""
            
            terminal_response = await self.ollama_client.generate_response(
                model="codellama:7b",
                prompt=terminal_prompt,
                system_prompt=f"You are an expert in {os_type} terminal operations. Provide safe, effective commands."
            )
            
            if "error" not in terminal_response:
                # Extract commands from response (basic parsing)
                response_text = terminal_response.get("response", "")
                commands = self._extract_commands_from_response(response_text, os_type)
                
                camper_responses.append({
                    "camper_role": "TerminalExpert",
                    "response_type": "command",
                    "content": response_text,
                    "files_to_create": [],
                    "commands_to_execute": commands,
                    "confidence_score": 0.8
                })
        
        # If no specific responses, use RequirementsGatherer
        if not camper_responses:
            req_prompt = f"""You are a RequirementsGatherer camper in CampfireValley. Analyze this task:
Task: {task}
Claim: {claim}
OS: {os_type}

Provide a detailed analysis of requirements and suggest next steps."""
            
            req_response = await self.ollama_client.generate_response(
                model="codellama:7b",
                prompt=req_prompt,
                system_prompt="You are an expert requirements analyst. Provide clear, actionable requirements."
            )
            
            if "error" not in req_response:
                camper_responses.append({
                    "camper_role": "RequirementsGatherer",
                    "response_type": "suggestion",
                    "content": req_response.get("response", ""),
                    "files_to_create": [],
                    "commands_to_execute": [],
                    "confidence_score": 0.7
                })
        
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
                elif line.startswith(('dir ', 'cd ', 'copy ', 'del ', 'mkdir ')):
                    commands.append(line)
            else:
                if line.startswith(('$ ', '# ', 'bash>', 'sh>')):
                    commands.append(line.split(' ', 1)[-1].strip())
                elif line.startswith(('ls ', 'cd ', 'cp ', 'rm ', 'mkdir ', 'python ', 'pip ')):
                    commands.append(line)
        
        return commands[:5]  # Limit to 5 commands for safety


class DevTeamProcessingError(Exception):
    """Raised when DevTeam campfire processing fails"""
    pass
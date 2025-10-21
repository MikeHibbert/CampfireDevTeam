# Requirements Document

## Introduction

The CampfireDevTeam feature provides an AI-driven development assistant ecosystem consisting of a VS Code plugin (CampfireDevAgent) that integrates with a local CampfireValley backend. The system leverages an Ollama server on an RTX 3060 Ti to enable real-time code generation, collaboration, and auditing through specialized AI campers in a development team cluster.

## Glossary

- **CampfireDevAgent**: The VS Code extension that provides the user interface and integration points
- **CampfireValley**: The backend framework that orchestrates AI campers and manages the development workflow
- **Campfire**: A collaborative workspace within CampfireValley containing specialized AI agents (campers)
- **Camper**: An AI agent with a specific role (e.g., BackEndDev, Tester, TerminalExpert, Auditor) within a campfire
- **Torch**: A message/request sent between components in the CampfireValley system
- **Party Box**: A shared storage mechanism for file attachments and context sharing
- **MCP**: Model Context Protocol for communication between VS Code plugin and CampfireValley
- **Ollama Server**: Local AI model server running on RTX 3060 Ti hardware
- **Valley**: The top-level container that hosts campfires and manages the overall system

## Requirements

### Requirement 1

**User Story:** As a developer, I want to trigger AI-assisted code generation from VS Code, so that I can quickly create code based on natural language prompts.

#### Acceptance Criteria

1. WHEN the developer presses Ctrl+Shift+P and selects "Campfire: Generate Code", THE CampfireDevAgent SHALL display a prompt input dialog
2. WHEN the developer enters a task description, THE CampfireDevAgent SHALL send a torch to the CampfireValley backend with the task details
3. WHEN the CampfireValley backend processes the request, THE CampfireDevAgent SHALL receive generated code within 1 second for small tasks
4. WHEN code is generated, THE CampfireDevAgent SHALL insert the code into the current editor or create a new file
5. IF the generation fails, THEN THE CampfireDevAgent SHALL display an error message to the developer

### Requirement 2

**User Story:** As a developer, I want to get real-time code suggestions and explanations, so that I can improve my coding efficiency and learn best practices.

#### Acceptance Criteria

1. WHILE the developer is typing code, THE CampfireDevAgent SHALL provide inline code completions based on campfire outputs
2. WHEN the developer requests code review via "Campfire: Review Code", THE CampfireDevAgent SHALL send the current file content to the auditor camper
3. WHEN the auditor camper completes the review, THE CampfireDevAgent SHALL display suggestions and improvements in the editor
4. THE CampfireDevAgent SHALL provide explanations for suggested code patterns and best practices

### Requirement 3

**User Story:** As a developer, I want the AI system to understand my current project context, so that generated code is relevant and properly integrated.

#### Acceptance Criteria

1. WHEN sending a torch, THE CampfireDevAgent SHALL attach the current file content as Party Box attachments
2. THE CampfireDevAgent SHALL include project structure information in the context
3. WHEN processing requests, THE CampfireValley backend SHALL analyze the provided context before generating code
4. THE generated code SHALL be compatible with the existing project structure and dependencies

### Requirement 4

**User Story:** As a developer, I want to configure the CampfireDevAgent connection settings, so that I can customize the integration with my local CampfireValley instance.

#### Acceptance Criteria

1. THE CampfireDevAgent SHALL read configuration from .vscode/settings.json
2. THE configuration SHALL include MCP server URL, Party Box path, and default prompt template
3. WHEN configuration is invalid, THE CampfireDevAgent SHALL display appropriate error messages
4. THE CampfireDevAgent SHALL allow runtime configuration updates without requiring VS Code restart

### Requirement 5

**User Story:** As a system administrator, I want to set up a local CampfireValley backend with specialized AI campers, so that the development team has access to role-specific AI assistance.

#### Acceptance Criteria

1. THE CampfireValley backend SHALL host a single campfire named "DevTeam"
2. THE DevTeam campfire SHALL contain eight specialized campers: RequirementsGatherer, OSExpert, BackEndDev, FrontEndDev, Tester, DevOps, TerminalExpert, and Auditor
3. THE CampfireValley backend SHALL connect to an Ollama server at localhost:11434
4. THE CampfireValley backend SHALL use Redis at localhost:6379 for MCP brokering
5. THE CampfireValley backend SHALL store Party Box files in the ./party_box directory

### Requirement 6

**User Story:** As a developer, I want the AI campers to collaborate on code generation tasks, so that I receive comprehensive solutions that cover multiple aspects of development.

#### Acceptance Criteria

1. WHEN a torch is received, THE RequirementsGatherer camper SHALL analyze the task and determine scope
2. THE OSExpert camper SHALL recommend appropriate technology stack based on the system environment
3. THE BackEndDev and FrontEndDev campers SHALL generate server-side and client-side code respectively
4. THE Tester camper SHALL create appropriate test cases for the generated code
5. THE DevOps camper SHALL provide deployment scripts when applicable
6. THE TerminalExpert camper SHALL suggest OS-specific terminal commands for debugging, log checking, Docker operations, and Python execution
7. THE Auditor camper SHALL verify all generated code for security, syntax, and coverage before publication

### Requirement 7

**User Story:** As a developer, I want the system to provide fast response times, so that my development workflow is not interrupted.

#### Acceptance Criteria

1. THE CampfireValley backend SHALL respond to torch requests within 1 second for small tasks
2. THE MCP server SHALL operate on localhost:8080/mcp for optimal local performance
3. THE Ollama server SHALL utilize RTX 3060 Ti hardware for AI model processing
4. THE system SHALL maintain local-only operation with no external network dependencies

### Requirement 8

**User Story:** As a developer, I want the system to handle file generation and management, so that I can seamlessly integrate AI-generated code into my project.

#### Acceptance Criteria

1. WHEN generating new files, THE CampfireDevAgent SHALL create files with appropriate names and extensions within the current workspace
2. THE CampfireDevAgent SHALL handle file I/O operations safely without overwriting existing files without confirmation
3. THE CampfireDevAgent SHALL create new code files in appropriate directories based on file type and project structure
4. THE Party Box SHALL store file attachments and maintain context between torch exchanges
5. THE system SHALL support various file types including Python, JavaScript, HTML, CSS, and configuration files

### Requirement 9

**User Story:** As a system administrator, I want to deploy the CampfireValley backend MCP service in Docker, so that I can ensure consistent deployment and easy management through Docker Desktop.

#### Acceptance Criteria

1. THE CampfireValley backend MCP service SHALL run inside a Docker container
2. THE Docker container SHALL be manageable through Docker Desktop
3. THE Docker container SHALL expose the MCP service on localhost:8080/mcp to the host system
4. THE Docker container SHALL connect to the Ollama server running on the host at localhost:11434
5. THE Docker container SHALL use Redis for MCP brokering with appropriate container networking
6. THE Docker container SHALL mount the Party Box directory as a volume for persistent file storage

### Requirement 10

**User Story:** As a developer, I want the AI system to execute terminal commands through VS Code, so that I can automate development tasks and have the AI perform system operations on my behalf.

#### Acceptance Criteria

1. THE CampfireDevAgent SHALL execute terminal commands through VS Code's integrated terminal
2. THE CampfireDevAgent SHALL detect the host operating system and pass this information to the MCP service
3. WHEN generating terminal commands, THE CampfireValley backend SHALL provide OS-specific commands based on the detected operating system
4. THE system SHALL use PowerShell commands when running on Windows
5. THE system SHALL use bash/shell commands when running on Linux or macOS
6. THE CampfireDevAgent SHALL display command output in VS Code's terminal for developer review
7. WHEN command execution fails, THE CampfireDevAgent SHALL capture and display error messages to the developer

### Requirement 11

**User Story:** As a developer, I want the VS Code plugin to properly format data for the CampfireValley dock system, so that communication between the plugin and backend is seamless and follows the required protocol.

#### Acceptance Criteria

1. THE CampfireDevAgent SHALL create Party Box payloads in the format required by the CampfireValley dock system
2. THE CampfireDevAgent SHALL package torch requests with proper Party Box formatting before sending to the MCP server
3. THE Party Box payload SHALL include file attachments, context information, and task details in the correct structure
4. THE CampfireDevAgent SHALL handle Party Box response parsing from the MCP server
5. WHEN creating Party Box payloads, THE CampfireDevAgent SHALL include metadata such as file paths, content types, and timestamps
6. THE CampfireDevAgent SHALL validate Party Box payload structure before transmission to prevent communication errors

### Requirement 12

**User Story:** As a system administrator, I want the CampfireValley backend to properly handle incoming Party Box deliveries through the riverboat system, so that requests are securely processed and routed to the appropriate development campfire.

#### Acceptance Criteria

1. WHEN a Party Box arrives from the VS Code plugin, THE CampfireValley backend SHALL receive it via the riverboat delivery system
2. THE unloading campfire SHALL unpack the Party Box and extract file paths, content, and task assertions
3. THE security campfire SHALL validate the Party Box contents for security compliance before processing
4. WHEN security validation passes, THE system SHALL create a new Party Box with processed contents including file examination paths and task directives
5. THE processed Party Box SHALL specify actions to be performed such as rewriting, debugging, syntax checking, or other development tasks
6. THE system SHALL route the validated Party Box to the DevTeam campfire for processing by appropriate campers
7. IF security validation fails, THEN THE system SHALL reject the Party Box and return an error response to the VS Code plugin

### Requirement 13

**User Story:** As a developer, I want the processed results from the DevTeam campfire to be returned to my VS Code plugin, so that I can receive the generated code, suggestions, or task results in my development environment.

#### Acceptance Criteria

1. WHEN the DevTeam campfire completes processing, THE system SHALL send a torch to the offloading campfire with the results
2. THE offloading campfire SHALL package the processed results into a new Party Box for return delivery
3. THE Party Box response SHALL contain generated code, suggestions, terminal commands, or other development artifacts
4. THE offloading campfire SHALL send the response Party Box back to the VS Code plugin via the riverboat system
5. THE CampfireDevAgent SHALL receive and unpack the response Party Box to extract the processed results
6. THE CampfireDevAgent SHALL apply the results to the VS Code environment by creating files, inserting code, or executing commands as appropriate
7. WHEN the response delivery fails, THE system SHALL retry the delivery or provide error notification to the developer

### Requirement 14

**User Story:** As a developer, I want the CampfireValley backend to be able to request specific actions from my VS Code plugin, so that the AI system can gather information and make changes to my development environment as needed.

#### Acceptance Criteria

1. THE CampfireDevAgent SHALL respond to directory listing requests from the backend by providing file and folder contents
2. WHEN the backend requests console output, THE CampfireDevAgent SHALL capture and return terminal text content
3. THE CampfireDevAgent SHALL respond to code section listing requests by providing specific portions of source files
4. WHEN the backend requests code updates, THE CampfireDevAgent SHALL edit and modify code files as specified
5. THE CampfireDevAgent SHALL validate backend requests for security and scope before execution
6. THE CampfireDevAgent SHALL provide confirmation responses to the backend after completing requested actions
7. IF a backend request cannot be fulfilled, THEN THE CampfireDevAgent SHALL return an appropriate error message with the reason

### Requirement 15

**User Story:** As a developer, I want the CampfireValley backend to understand my current VS Code workspace, so that file references and operations are performed relative to the correct project root folder.

#### Acceptance Criteria

1. THE CampfireDevAgent SHALL detect the current open root folder in VS Code workspace
2. THE CampfireDevAgent SHALL configure the CampfireValley backend with the workspace root folder path
3. THE CampfireValley backend SHALL use the configured workspace root as the base path for all file references in Party Box operations
4. WHEN the VS Code workspace changes, THE CampfireDevAgent SHALL update the CampfireValley backend configuration accordingly
5. THE Party Box file references SHALL be relative to the configured workspace root folder
6. THE CampfireValley backend SHALL validate that requested file paths exist within the configured workspace boundary
7. IF file operations are requested outside the workspace boundary, THEN THE system SHALL reject the request for security reasons
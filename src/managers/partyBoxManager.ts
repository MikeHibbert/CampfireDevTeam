/**
 * Party Box Manager for VS Code plugin
 * Leverages CampfireValley's existing Party Box functionality
 * Based on requirements 11.1, 11.2, 11.4, 11.5, 11.6, 13.5
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PartyBox, Torch, Attachment, Context, CamperResponse, ErrorResponse } from '../types/partyBox';
import { CampfireConfig } from '../types/config';

export class PartyBoxManager {
    private config: CampfireConfig;

    constructor(config: CampfireConfig) {
        this.config = config;
    }

    /**
     * Create a properly formatted Party Box payload for CampfireValley dock system
     * Requirement 11.1: Create Party Box payloads in the format required by the CampfireValley dock system
     */
    async createPartyBoxPayload(
        claim: 'generate_code' | 'review_code' | 'execute_command',
        task: string,
        attachments: Attachment[] = [],
        context?: Partial<Context>
    ): Promise<PartyBox> {
        try {
            // Get current workspace root
            const workspaceRoot = this.config.workspaceRoot || '';
            
            // Build context information
            const fullContext: Context = {
                current_file: await this.getCurrentFileName(),
                project_structure: await this.getProjectStructure(),
                terminal_history: await this.getTerminalHistory(),
                ...context
            };

            // Create torch with proper structure
            const torch: Torch = {
                claim,
                task,
                os: this.config.osType || 'windows',
                workspace_root: workspaceRoot,
                attachments,
                context: fullContext
            };

            // Create Party Box with metadata
            const partyBox: PartyBox = {
                torch,
                metadata: {
                    created_at: new Date().toISOString(),
                    plugin_version: '0.0.1',
                    vscode_version: vscode.version,
                    workspace_name: path.basename(workspaceRoot)
                }
            };

            return partyBox;

        } catch (error) {
            throw new Error(`Failed to create Party Box payload: ${error}`);
        }
    }

    /**
     * Validate Party Box payload structure before transmission
     * Requirement 11.6: Validate Party Box payload structure before transmission to prevent communication errors
     */
    validatePartyBoxPayload(partyBox: PartyBox): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Validate torch structure
        if (!partyBox.torch) {
            errors.push('Missing torch in Party Box');
            return { isValid: false, errors };
        }

        const { torch } = partyBox;

        // Validate required torch fields
        if (!torch.claim || !['generate_code', 'review_code', 'execute_command'].includes(torch.claim)) {
            errors.push('Invalid or missing torch claim');
        }

        if (!torch.task || torch.task.trim() === '') {
            errors.push('Missing or empty task description');
        }

        if (!torch.os || !['windows', 'linux', 'macos'].includes(torch.os)) {
            errors.push('Invalid or missing OS type');
        }

        if (!torch.workspace_root) {
            errors.push('Missing workspace root');
        }

        // Validate attachments structure
        if (torch.attachments && Array.isArray(torch.attachments)) {
            torch.attachments.forEach((attachment, index) => {
                if (!attachment.path) {
                    errors.push(`Attachment ${index}: missing path`);
                }
                if (!attachment.content) {
                    errors.push(`Attachment ${index}: missing content`);
                }
                if (!attachment.type) {
                    errors.push(`Attachment ${index}: missing type`);
                }
                if (!attachment.timestamp) {
                    errors.push(`Attachment ${index}: missing timestamp`);
                }
            });
        }

        // Validate context structure
        if (torch.context) {
            if (torch.context.project_structure && !Array.isArray(torch.context.project_structure)) {
                errors.push('Context project_structure must be an array');
            }
            if (torch.context.terminal_history && !Array.isArray(torch.context.terminal_history)) {
                errors.push('Context terminal_history must be an array');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Package torch requests with proper Party Box formatting before sending to MCP server
     * Requirement 11.2: Package torch requests with proper Party Box formatting before sending to the MCP server
     */
    packageTorchRequest(partyBox: PartyBox): any {
        // Validate before packaging
        const validation = this.validatePartyBoxPayload(partyBox);
        if (!validation.isValid) {
            throw new Error(`Invalid Party Box: ${validation.errors.join(', ')}`);
        }

        // Create MCP-compatible envelope following CampfireValley format
        const mcpEnvelope = {
            jsonrpc: '2.0',
            method: 'torch/deliver',
            params: {
                torch: {
                    type: 'torch',
                    version: '1.0',
                    data: {
                        torch_id: this.generateTorchId(),
                        sender_valley: 'VSCodePlugin',
                        target_address: 'CampfireValley:DevTeam/dockmaster/loader',
                        payload: partyBox.torch,
                        signature: this.generateSignature(partyBox),
                        timestamp: new Date().toISOString(),
                        attachments: partyBox.torch.attachments.map(att => att.path),
                        metadata: partyBox.metadata || {}
                    },
                    routing: {
                        sender: 'VSCodePlugin',
                        target: 'CampfireValley:DevTeam',
                        channel: 'campfire.valley.CampfireValley'
                    }
                },
                routing: {
                    sender_valley: 'VSCodePlugin',
                    target_address: 'CampfireValley:DevTeam/dockmaster/loader',
                    message_id: this.generateTorchId(),
                    timestamp: new Date().toISOString()
                }
            },
            id: this.generateTorchId()
        };

        return mcpEnvelope;
    }

    /**
     * Parse and extract data from response Party Boxes
     * Requirement 11.4: Handle Party Box response parsing from the MCP server
     * Requirement 13.5: Handle different response types (code, suggestions, commands, errors)
     */
    parsePartyBoxResponse(responseData: any): CamperResponse | ErrorResponse {
        try {
            // Handle MCP envelope format
            if (responseData.jsonrpc) {
                // Handle MCP error responses
                if (responseData.error) {
                    return {
                        error: {
                            code: responseData.error.code || 'MCP_ERROR',
                            message: responseData.error.message || 'MCP communication error',
                            details: responseData.error.data || {},
                            retry_possible: this.isRetryableError(responseData.error.code)
                        }
                    };
                }

                // Handle successful MCP responses
                if (responseData.result) {
                    return this.parseSuccessfulResponse(responseData.result);
                }
            }

            // Handle direct Party Box response format (from CampfireValley)
            if (responseData.torch || responseData.data) {
                return this.parseSuccessfulResponse(responseData);
            }

            // Handle CampfireValley riverboat response format
            if (responseData.type === 'torch' && responseData.data) {
                return this.parseSuccessfulResponse(responseData.data);
            }

            throw new Error('Unrecognized response format');

        } catch (error) {
            return {
                error: {
                    code: 'PARSE_ERROR',
                    message: `Failed to parse Party Box response: ${error}`,
                    details: { originalResponse: responseData },
                    retry_possible: false
                }
            };
        }
    }

    /**
     * Parse successful response data from various formats
     */
    private parseSuccessfulResponse(data: any): CamperResponse {
        // Extract torch data from various possible structures
        let torchData = data;
        
        if (data.torch) {
            torchData = data.torch;
        } else if (data.data && data.data.torch) {
            torchData = data.data.torch;
        } else if (data.payload) {
            torchData = data.payload;
        }

        // Handle different response types
        const responseType = this.determineResponseType(torchData);
        
        return {
            camper_role: torchData.camper_role || torchData.sender || 'DevTeam',
            response_type: responseType,
            content: this.extractContent(torchData, responseType),
            files_to_create: this.extractFilesToCreate(torchData),
            commands_to_execute: this.extractCommandsToExecute(torchData),
            confidence_score: torchData.confidence_score || torchData.confidence || 1.0
        };
    }

    /**
     * Determine the response type based on content analysis
     */
    private determineResponseType(data: any): 'code' | 'suggestion' | 'command' | 'error' {
        // Check explicit response type
        if (data.response_type) {
            return data.response_type;
        }

        // Check for error indicators
        if (data.error || data.errors || (data.content && data.content.includes('ERROR'))) {
            return 'error';
        }

        // Check for command indicators
        if (data.commands_to_execute && data.commands_to_execute.length > 0) {
            return 'command';
        }

        // Check for code indicators
        if (data.files_to_create && data.files_to_create.length > 0) {
            return 'code';
        }

        // Check content for code patterns
        if (data.content) {
            const content = data.content.toLowerCase();
            if (content.includes('function') || 
                content.includes('class') || 
                content.includes('import') ||
                content.includes('def ') ||
                content.includes('public ') ||
                content.includes('private ')) {
                return 'code';
            }
        }

        // Default to suggestion
        return 'suggestion';
    }

    /**
     * Extract content from response data
     */
    private extractContent(data: any, responseType: string): string {
        // Try different content fields
        if (data.content) {
            return data.content;
        }
        
        if (data.message) {
            return data.message;
        }

        if (data.response) {
            return data.response;
        }

        if (data.result) {
            return typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
        }

        // For code responses, try to extract from files
        if (responseType === 'code' && data.files_to_create && data.files_to_create.length > 0) {
            return data.files_to_create.map((file: any) => 
                `// ${file.path || file.name}\n${file.content}`
            ).join('\n\n');
        }

        return '';
    }

    /**
     * Extract files to create from response data
     */
    private extractFilesToCreate(data: any): Array<{ path: string; content: string }> {
        const files: Array<{ path: string; content: string }> = [];

        // Check various possible fields
        if (data.files_to_create && Array.isArray(data.files_to_create)) {
            return data.files_to_create.map((file: any) => ({
                path: file.path || file.name || file.filename || 'untitled.txt',
                content: file.content || file.code || ''
            }));
        }

        if (data.files && Array.isArray(data.files)) {
            return data.files.map((file: any) => ({
                path: file.path || file.name || file.filename || 'untitled.txt',
                content: file.content || file.code || ''
            }));
        }

        if (data.generated_files && Array.isArray(data.generated_files)) {
            return data.generated_files.map((file: any) => ({
                path: file.path || file.name || file.filename || 'untitled.txt',
                content: file.content || file.code || ''
            }));
        }

        return files;
    }

    /**
     * Extract commands to execute from response data
     */
    private extractCommandsToExecute(data: any): string[] {
        const commands: string[] = [];

        // Check various possible fields
        if (data.commands_to_execute && Array.isArray(data.commands_to_execute)) {
            return data.commands_to_execute.filter((cmd: any) => typeof cmd === 'string');
        }

        if (data.commands && Array.isArray(data.commands)) {
            return data.commands.filter((cmd: any) => typeof cmd === 'string');
        }

        if (data.terminal_commands && Array.isArray(data.terminal_commands)) {
            return data.terminal_commands.filter((cmd: any) => typeof cmd === 'string');
        }

        if (data.scripts && Array.isArray(data.scripts)) {
            return data.scripts.filter((cmd: any) => typeof cmd === 'string');
        }

        return commands;
    }

    /**
     * Check if an error code indicates a retryable condition
     */
    private isRetryableError(errorCode: string): boolean {
        const retryableCodes = [
            'TIMEOUT',
            'CONNECTION_ERROR',
            'TEMPORARY_FAILURE',
            'RATE_LIMITED',
            'SERVICE_UNAVAILABLE',
            'NETWORK_ERROR'
        ];

        return retryableCodes.includes(errorCode);
    }

    /**
     * Validate response structure for completeness
     */
    validatePartyBoxResponse(response: CamperResponse | ErrorResponse): { isValid: boolean; warnings: string[] } {
        const warnings: string[] = [];

        // Check if it's an error response
        if ('error' in response) {
            return { isValid: true, warnings: [] }; // Error responses are valid
        }

        const camperResponse = response as CamperResponse;

        // Check for missing or suspicious data
        if (!camperResponse.camper_role || camperResponse.camper_role === 'unknown') {
            warnings.push('Camper role is unknown or missing');
        }

        if (!camperResponse.content && 
            camperResponse.files_to_create.length === 0 && 
            camperResponse.commands_to_execute.length === 0) {
            warnings.push('Response contains no actionable content');
        }

        if (camperResponse.confidence_score < 0.5) {
            warnings.push('Low confidence score in response');
        }

        if (camperResponse.response_type === 'error' && !camperResponse.content.includes('error')) {
            warnings.push('Response marked as error but content does not indicate error');
        }

        return {
            isValid: true,
            warnings
        };
    }

    /**
     * Create file attachment with metadata
     * Requirement 11.5: Include metadata such as file paths, content types, and timestamps
     */
    async createFileAttachment(filePath: string): Promise<Attachment> {
        try {
            const absolutePath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(this.config.workspaceRoot || '', filePath);

            const content = await fs.readFile(absolutePath, 'utf-8');
            const relativePath = this.config.workspaceRoot 
                ? path.relative(this.config.workspaceRoot, absolutePath)
                : filePath;

            return {
                path: relativePath,
                content,
                type: this.getContentType(filePath),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`Failed to create file attachment for ${filePath}: ${error}`);
        }
    }

    /**
     * Create attachment from current active editor
     */
    async createCurrentFileAttachment(): Promise<Attachment | null> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }

        const document = activeEditor.document;
        const relativePath = this.config.workspaceRoot 
            ? path.relative(this.config.workspaceRoot, document.fileName)
            : document.fileName;

        return {
            path: relativePath,
            content: document.getText(),
            type: this.getContentType(document.fileName),
            timestamp: new Date().toISOString()
        };
    }

    // Private helper methods

    private async getCurrentFileName(): Promise<string | undefined> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return undefined;
        }

        const document = activeEditor.document;
        return this.config.workspaceRoot 
            ? path.relative(this.config.workspaceRoot, document.fileName)
            : document.fileName;
    }

    private async getProjectStructure(): Promise<string[]> {
        if (!this.config.workspaceRoot) {
            return [];
        }

        try {
            const files = await this.scanDirectory(this.config.workspaceRoot, 2); // Max depth 2
            return files.map(file => 
                path.relative(this.config.workspaceRoot!, file)
            );
        } catch (error) {
            console.warn('Failed to scan project structure:', error);
            return [];
        }
    }

    private async scanDirectory(dirPath: string, maxDepth: number, currentDepth = 0): Promise<string[]> {
        if (currentDepth >= maxDepth) {
            return [];
        }

        const files: string[] = [];
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                // Skip hidden files and common ignore patterns
                if (entry.name.startsWith('.') || 
                    entry.name === 'node_modules' || 
                    entry.name === '__pycache__') {
                    continue;
                }

                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isFile()) {
                    files.push(fullPath);
                } else if (entry.isDirectory()) {
                    const subFiles = await this.scanDirectory(fullPath, maxDepth, currentDepth + 1);
                    files.push(...subFiles);
                }
            }
        } catch (error) {
            // Ignore permission errors and continue
        }

        return files;
    }

    private async getTerminalHistory(): Promise<string[]> {
        // VS Code doesn't provide direct access to terminal history
        // Return empty array for now - could be enhanced with terminal integration
        return [];
    }

    private getContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const typeMap: Record<string, string> = {
            '.ts': 'text/typescript',
            '.js': 'text/javascript',
            '.py': 'text/python',
            '.java': 'text/java',
            '.cpp': 'text/cpp',
            '.c': 'text/c',
            '.cs': 'text/csharp',
            '.html': 'text/html',
            '.css': 'text/css',
            '.json': 'application/json',
            '.xml': 'text/xml',
            '.md': 'text/markdown',
            '.txt': 'text/plain'
        };

        return typeMap[ext] || 'text/plain';
    }

    private generateTorchId(): string {
        return `torch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateSignature(partyBox: PartyBox): string {
        // Simple signature generation - in production, this would use proper cryptographic signing
        const content = JSON.stringify(partyBox.torch);
        return Buffer.from(content).toString('base64').substr(0, 32);
    }
}
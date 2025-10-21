"use strict";
/**
 * Command handler for VS Code commands
 * Based on requirements 1.1, 2.2, 1.2, 1.3, 1.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandHandler = void 0;
const vscode = require("vscode");
const partyBoxManager_1 = require("../managers/partyBoxManager");
const fileOperationsManager_1 = require("../managers/fileOperationsManager");
const mcpClient_1 = require("./mcpClient");
class CommandHandler {
    constructor(configManager, workspaceManager, terminalManager) {
        this.configManager = configManager;
        this.workspaceManager = workspaceManager;
        this.terminalManager = terminalManager;
        // Initialize managers with current configuration
        const config = this.configManager.getConfiguration();
        this.partyBoxManager = new partyBoxManager_1.PartyBoxManager(config);
        this.fileOpsManager = new fileOperationsManager_1.FileOperationsManager(workspaceManager);
        this.mcpClient = new mcpClient_1.MCPClient(config);
    }
    /**
     * Handle "Campfire: Generate Code" command
     * Requirements 1.1: Display prompt input dialog and send torch to CampfireValley backend
     */
    async handleGenerateCode() {
        try {
            // Show input dialog for task description
            const taskDescription = await vscode.window.showInputBox({
                prompt: 'Enter task description for code generation',
                placeHolder: 'e.g., Create a REST API endpoint for user authentication',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Task description cannot be empty';
                    }
                    if (value.length > 500) {
                        return 'Task description is too long (max 500 characters)';
                    }
                    return null;
                }
            });
            if (!taskDescription) {
                return; // User cancelled
            }
            // Show progress indicator
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating code with Campfire...',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Creating Party Box...' });
                try {
                    // Create current file attachment if available
                    const currentFileAttachment = await this.partyBoxManager.createCurrentFileAttachment();
                    const attachments = currentFileAttachment ? [currentFileAttachment] : [];
                    // Create Party Box payload
                    const partyBox = await this.partyBoxManager.createPartyBoxPayload('generate_code', taskDescription, attachments);
                    progress.report({ increment: 25, message: 'Sending request to CampfireValley...' });
                    // Check for cancellation
                    if (token.isCancellationRequested) {
                        return;
                    }
                    // Send to MCP server
                    const response = await this.mcpClient.sendTorchRequest(partyBox);
                    progress.report({ increment: 75, message: 'Processing response...' });
                    // Handle response
                    await this.handleCampfireResponse(response, 'Code generation');
                    progress.report({ increment: 100, message: 'Complete!' });
                }
                catch (error) {
                    throw error;
                }
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Code generation failed: ${errorMessage}`);
            console.error('Code generation error:', error);
        }
    }
    /**
     * Handle "Campfire: Review Code" command
     * Requirements 2.2: Send current file content to auditor camper and display suggestions
     */
    async handleReviewCode() {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No active file to review. Please open a file first.');
                return;
            }
            const document = activeEditor.document;
            // Check if document has unsaved changes
            if (document.isDirty) {
                const saveFirst = await vscode.window.showWarningMessage('The current file has unsaved changes. Save before review?', 'Save and Review', 'Review Anyway', 'Cancel');
                if (saveFirst === 'Cancel') {
                    return;
                }
                else if (saveFirst === 'Save and Review') {
                    await document.save();
                }
            }
            // Show progress indicator
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Reviewing code with Campfire...',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Preparing file for review...' });
                try {
                    // Create file attachment for current document
                    const fileAttachment = await this.partyBoxManager.createCurrentFileAttachment();
                    if (!fileAttachment) {
                        throw new Error('Failed to create file attachment for review');
                    }
                    // Create Party Box payload for code review
                    const reviewTask = `Review the code in ${fileAttachment.path} for security, syntax, best practices, and potential improvements`;
                    const partyBox = await this.partyBoxManager.createPartyBoxPayload('review_code', reviewTask, [fileAttachment]);
                    progress.report({ increment: 25, message: 'Sending to auditor camper...' });
                    // Check for cancellation
                    if (token.isCancellationRequested) {
                        return;
                    }
                    // Send to MCP server
                    const response = await this.mcpClient.sendTorchRequest(partyBox);
                    progress.report({ increment: 75, message: 'Processing review results...' });
                    // Handle response
                    await this.handleCampfireResponse(response, 'Code review');
                    progress.report({ increment: 100, message: 'Review complete!' });
                }
                catch (error) {
                    throw error;
                }
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Code review failed: ${errorMessage}`);
            console.error('Code review error:', error);
        }
    }
    /**
     * Handle responses from CampfireValley backend
     * Requirements 1.3, 1.4: Receive generated code and insert into editor or create new file
     */
    async handleCampfireResponse(response, operationType) {
        // Handle error responses
        if ('error' in response) {
            const errorMsg = `${operationType} failed: ${response.error.message}`;
            if (response.error.retry_possible) {
                const retry = await vscode.window.showErrorMessage(errorMsg, 'Retry', 'Cancel');
                if (retry === 'Retry') {
                    // Could implement retry logic here
                    vscode.window.showInformationMessage('Retry functionality will be implemented in future updates');
                }
            }
            else {
                vscode.window.showErrorMessage(errorMsg);
            }
            console.error(`${operationType} error:`, response.error);
            return;
        }
        const camperResponse = response;
        // Validate response
        const validation = this.partyBoxManager.validatePartyBoxResponse(camperResponse);
        if (validation.warnings.length > 0) {
            console.warn('Response validation warnings:', validation.warnings);
        }
        // Handle different response types
        switch (camperResponse.response_type) {
            case 'code':
                await this.handleCodeResponse(camperResponse);
                break;
            case 'suggestion':
                await this.handleSuggestionResponse(camperResponse);
                break;
            case 'command':
                await this.handleCommandResponse(camperResponse);
                break;
            case 'error':
                vscode.window.showErrorMessage(`${operationType} error: ${camperResponse.content}`);
                break;
            default:
                // Fallback: show content as information
                if (camperResponse.content) {
                    vscode.window.showInformationMessage(`${operationType} result: ${camperResponse.content.substring(0, 100)}...`);
                }
        }
        // Show confidence score if low
        if (camperResponse.confidence_score < 0.7) {
            vscode.window.showWarningMessage(`Note: ${camperResponse.camper_role} has low confidence (${Math.round(camperResponse.confidence_score * 100)}%) in this response`);
        }
    }
    /**
     * Handle code generation responses
     */
    async handleCodeResponse(response) {
        // Create files if specified
        if (response.files_to_create.length > 0) {
            for (const file of response.files_to_create) {
                try {
                    await this.fileOpsManager.createCodeFile(file.path, file.content);
                    vscode.window.showInformationMessage(`Created file: ${file.path}`);
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Failed to create file ${file.path}: ${error}`);
                }
            }
        }
        else if (response.content) {
            // Insert code into current editor or create new file
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const selection = activeEditor.selection;
                await activeEditor.edit(editBuilder => {
                    if (selection.isEmpty) {
                        // Insert at cursor position
                        editBuilder.insert(selection.active, response.content);
                    }
                    else {
                        // Replace selected text
                        editBuilder.replace(selection, response.content);
                    }
                });
                vscode.window.showInformationMessage('Code inserted into current file');
            }
            else {
                // Create new untitled document
                const document = await vscode.workspace.openTextDocument({
                    content: response.content,
                    language: 'plaintext'
                });
                await vscode.window.showTextDocument(document);
                vscode.window.showInformationMessage('Code generated in new file');
            }
        }
    }
    /**
     * Handle suggestion responses
     */
    async handleSuggestionResponse(response) {
        // Show suggestions in information message with option to view details
        const action = await vscode.window.showInformationMessage(`${response.camper_role}: ${response.content.substring(0, 100)}...`, 'View Details', 'Dismiss');
        if (action === 'View Details') {
            // Create new document with full suggestions
            const document = await vscode.workspace.openTextDocument({
                content: `# ${response.camper_role} Suggestions\n\n${response.content}`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(document);
        }
    }
    /**
     * Handle command execution responses
     */
    async handleCommandResponse(response) {
        if (response.commands_to_execute.length === 0) {
            return;
        }
        // Ask user for permission to execute commands
        const executeCommands = await vscode.window.showWarningMessage(`${response.camper_role} suggests executing ${response.commands_to_execute.length} command(s). Execute them?`, 'Execute All', 'Review First', 'Cancel');
        if (executeCommands === 'Cancel') {
            return;
        }
        if (executeCommands === 'Review First') {
            // Show commands for review
            const commandList = response.commands_to_execute.join('\n');
            const document = await vscode.workspace.openTextDocument({
                content: `# Suggested Commands\n\n\`\`\`bash\n${commandList}\n\`\`\`\n\n${response.content}`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(document);
            return;
        }
        // Execute commands
        for (const command of response.commands_to_execute) {
            try {
                await this.terminalManager.executeCommand(command);
                vscode.window.showInformationMessage(`Executed: ${command}`);
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to execute command "${command}": ${error}`);
            }
        }
    }
    /**
     * Update configuration and reinitialize managers
     */
    updateConfiguration() {
        const config = this.configManager.getConfiguration();
        this.partyBoxManager = new partyBoxManager_1.PartyBoxManager(config);
        this.mcpClient = new mcpClient_1.MCPClient(config);
    }
}
exports.CommandHandler = CommandHandler;
//# sourceMappingURL=commandHandler.js.map
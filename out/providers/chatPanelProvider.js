"use strict";
/**
 * Chat Panel Provider for CampfireDevTeam
 * Provides a side panel chat interface similar to GitHub Copilot
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampfireChatPanelProvider = void 0;
const vscode = require("vscode");
const partyBoxManager_1 = require("../managers/partyBoxManager");
const mcpClient_1 = require("../handlers/mcpClient");
class CampfireChatPanelProvider {
    constructor(_extensionUri, config) {
        this._extensionUri = _extensionUri;
        this.config = config;
        this.chatHistory = [];
        this.partyBoxManager = new partyBoxManager_1.PartyBoxManager(config);
        this.mcpClient = new mcpClient_1.MCPClient(config);
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'sendMessage':
                    this.handleUserMessage(message.text);
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
                case 'selectCamper':
                    this.selectCamper(message.camper);
                    break;
                case 'createFile':
                    this.handleFileCreation(message.file);
                    break;
                case 'executeCommand':
                    this.handleCommandExecution(message.command);
                    break;
            }
        }, undefined, []);
    }
    async handleUserMessage(text) {
        if (!this._view) {
            return;
        }
        // Add user message to chat
        const userMessage = {
            id: Date.now().toString(),
            type: 'user',
            content: text,
            timestamp: new Date()
        };
        this.chatHistory.push(userMessage);
        this.updateChatDisplay();
        // Show typing indicator
        this.showTypingIndicator();
        try {
            // Determine the appropriate claim based on the message content
            const claim = this.determineClaimFromMessage(text);
            // Create current file attachment if available
            const currentFileAttachment = await this.partyBoxManager.createCurrentFileAttachment();
            const attachments = currentFileAttachment ? [currentFileAttachment] : [];
            // Create Party Box payload
            const partyBox = await this.partyBoxManager.createPartyBoxPayload(claim, text, attachments);
            // Send to MCP server
            const response = await this.mcpClient.sendTorchRequest(partyBox);
            // Hide typing indicator
            this.hideTypingIndicator();
            // Handle response
            await this.handleCampfireResponse(response, text);
        }
        catch (error) {
            this.hideTypingIndicator();
            const errorMessage = {
                id: Date.now().toString(),
                type: 'error',
                content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: new Date()
            };
            this.chatHistory.push(errorMessage);
            this.updateChatDisplay();
        }
    }
    determineClaimFromMessage(text) {
        const lowerText = text.toLowerCase();
        // Check for code review keywords
        if (lowerText.includes('review') || lowerText.includes('check') ||
            lowerText.includes('audit') || lowerText.includes('security') ||
            lowerText.includes('analyze') || lowerText.includes('improve')) {
            return 'review_code';
        }
        // Check for command/terminal keywords
        if (lowerText.includes('command') || lowerText.includes('terminal') ||
            lowerText.includes('run') || lowerText.includes('execute') ||
            lowerText.includes('deploy') || lowerText.includes('install')) {
            return 'execute_command';
        }
        // Default to code generation
        return 'generate_code';
    }
    async handleCampfireResponse(response, originalMessage) {
        if ('error' in response) {
            const errorMessage = {
                id: Date.now().toString(),
                type: 'error',
                content: `Error: ${response.error.message}`,
                timestamp: new Date()
            };
            this.chatHistory.push(errorMessage);
            this.updateChatDisplay();
            return;
        }
        const camperResponse = response;
        // Create assistant message
        const assistantMessage = {
            id: Date.now().toString(),
            type: 'assistant',
            content: camperResponse.content,
            timestamp: new Date(),
            camperRole: camperResponse.camper_role,
            responseType: camperResponse.response_type,
            confidenceScore: camperResponse.confidence_score,
            filesToCreate: camperResponse.files_to_create,
            commandsToExecute: camperResponse.commands_to_execute
        };
        this.chatHistory.push(assistantMessage);
        this.updateChatDisplay();
        // Handle file creation if specified
        if (camperResponse.files_to_create.length > 0) {
            this.showFileCreationOptions(camperResponse.files_to_create);
        }
        // Handle command execution if specified
        if (camperResponse.commands_to_execute.length > 0) {
            this.showCommandExecutionOptions(camperResponse.commands_to_execute);
        }
    }
    showFileCreationOptions(files) {
        if (!this._view)
            return;
        this._view.webview.postMessage({
            type: 'showFileOptions',
            files: files
        });
    }
    showCommandExecutionOptions(commands) {
        if (!this._view)
            return;
        this._view.webview.postMessage({
            type: 'showCommandOptions',
            commands: commands
        });
    }
    showTypingIndicator() {
        if (!this._view)
            return;
        this._view.webview.postMessage({
            type: 'showTyping'
        });
    }
    hideTypingIndicator() {
        if (!this._view)
            return;
        this._view.webview.postMessage({
            type: 'hideTyping'
        });
    }
    clearChat() {
        this.chatHistory = [];
        this.updateChatDisplay();
    }
    selectCamper(camper) {
        // Could be used to direct messages to specific campers
        vscode.window.showInformationMessage(`Selected ${camper} camper for next interaction`);
    }
    updateChatDisplay() {
        if (!this._view)
            return;
        this._view.webview.postMessage({
            type: 'updateChat',
            messages: this.chatHistory
        });
    }
    async handleFileCreation(file) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, file.path);
            // Check if file already exists
            try {
                await vscode.workspace.fs.stat(filePath);
                const overwrite = await vscode.window.showWarningMessage(`File ${file.path} already exists. Overwrite?`, 'Overwrite', 'Cancel');
                if (overwrite !== 'Overwrite') {
                    return;
                }
            }
            catch {
                // File doesn't exist, which is fine
            }
            // Create the file
            await vscode.workspace.fs.writeFile(filePath, Buffer.from(file.content, 'utf8'));
            // Open the file
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
            vscode.window.showInformationMessage(`Created file: ${file.path}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async handleCommandExecution(command) {
        try {
            const terminal = vscode.window.createTerminal('Campfire Command');
            terminal.show();
            terminal.sendText(command);
            vscode.window.showInformationMessage(`Executing command: ${command}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    updateConfiguration(config) {
        this.config = config;
        this.partyBoxManager = new partyBoxManager_1.PartyBoxManager(config);
        this.mcpClient = new mcpClient_1.MCPClient(config);
    }
    _getHtmlForWebview(webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css'));
        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Campfire Chat</title>
            </head>
            <body>
                <div class="chat-container">
                    <div class="chat-header">
                        <h3>🔥 CampfireDevTeam</h3>
                        <div class="camper-selector">
                            <select id="camperSelect">
                                <option value="auto">Auto-select Camper</option>
                                <option value="RequirementsGatherer">Requirements Gatherer</option>
                                <option value="OSExpert">OS Expert</option>
                                <option value="BackEndDev">Backend Developer</option>
                                <option value="FrontEndDev">Frontend Developer</option>
                                <option value="Tester">Tester</option>
                                <option value="DevOps">DevOps</option>
                                <option value="TerminalExpert">Terminal Expert</option>
                                <option value="Auditor">Auditor</option>
                            </select>
                        </div>
                        <button id="clearChat" class="clear-btn" title="Clear Chat">🗑️</button>
                    </div>
                    
                    <div class="chat-messages" id="chatMessages">
                        <div class="welcome-message">
                            <div class="camper-avatar">🔥</div>
                            <div class="message-content">
                                <div class="camper-name">CampfireDevTeam</div>
                                <div class="message-text">
                                    Welcome! I'm your AI development team. Ask me to:
                                    <ul>
                                        <li>Generate code for any language or framework</li>
                                        <li>Review your code for security and best practices</li>
                                        <li>Help with deployment and DevOps tasks</li>
                                        <li>Provide terminal commands and debugging help</li>
                                        <li>Plan project architecture and requirements</li>
                                    </ul>
                                    What can I help you build today?
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="typing-indicator" id="typingIndicator" style="display: none;">
                        <div class="camper-avatar">🤖</div>
                        <div class="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                    
                    <div class="chat-input-container">
                        <div class="input-wrapper">
                            <textarea 
                                id="chatInput" 
                                placeholder="Ask me anything about development..."
                                rows="1"
                            ></textarea>
                            <button id="sendButton" class="send-btn">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M15.854 7.146a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708-.708L14.293 8 8.146 1.854a.5.5 0 1 1 .708-.708l7 7z"/>
                                    <path d="M8 1a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13A.5.5 0 0 1 8 1z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
exports.CampfireChatPanelProvider = CampfireChatPanelProvider;
CampfireChatPanelProvider.viewType = 'campfire.chatPanel';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=chatPanelProvider.js.map
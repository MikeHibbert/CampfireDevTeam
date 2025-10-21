"use strict";
/**
 * Main extension entry point for CampfireDevAgent
 * Based on requirements 1.1, 1.2, 1.3, 1.4, 2.2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const commandHandler_1 = require("./handlers/commandHandler");
const configurationManager_1 = require("./managers/configurationManager");
const workspaceManager_1 = require("./managers/workspaceManager");
const terminalManager_1 = require("./managers/terminalManager");
const fileOperationsManager_1 = require("./managers/fileOperationsManager");
const backendRequestHandler_1 = require("./managers/backendRequestHandler");
const partyBoxManager_1 = require("./managers/partyBoxManager");
const mcpClient_1 = require("./handlers/mcpClient");
const chatPanelProvider_1 = require("./providers/chatPanelProvider");
let commandHandler;
let configManager;
let workspaceManager;
let terminalManager;
let fileOperationsManager;
let backendRequestHandler;
let partyBoxManager;
let mcpClient;
let chatPanelProvider;
function activate(context) {
    console.log('CampfireDevAgent is now active');
    try {
        // Initialize workspace manager first
        workspaceManager = new workspaceManager_1.WorkspaceManager();
        // Initialize terminal manager
        terminalManager = new terminalManager_1.TerminalManager(workspaceManager);
        // Initialize file operations manager
        fileOperationsManager = new fileOperationsManager_1.FileOperationsManager(workspaceManager);
        // Initialize configuration manager with workspace manager
        configManager = new configurationManager_1.ConfigurationManager(workspaceManager);
        // Initialize Party Box manager with configuration
        const config = configManager.getConfiguration();
        partyBoxManager = new partyBoxManager_1.PartyBoxManager(config);
        // Initialize MCP client with configuration
        mcpClient = new mcpClient_1.MCPClient(config);
        // Initialize backend request handler
        backendRequestHandler = new backendRequestHandler_1.BackendRequestHandler(workspaceManager, terminalManager, fileOperationsManager);
        // Initialize command handler with all required dependencies
        commandHandler = new commandHandler_1.CommandHandler(configManager, workspaceManager, terminalManager);
        // Initialize chat panel provider
        chatPanelProvider = new chatPanelProvider_1.CampfireChatPanelProvider(context.extensionUri, config);
        // Register webview panel provider
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatPanelProvider_1.CampfireChatPanelProvider.viewType, chatPanelProvider));
        // Register commands
        const generateCodeCommand = vscode.commands.registerCommand('campfire.generateCode', () => commandHandler.handleGenerateCode());
        const reviewCodeCommand = vscode.commands.registerCommand('campfire.reviewCode', () => commandHandler.handleReviewCode());
        const openChatCommand = vscode.commands.registerCommand('campfire.openChat', () => {
            vscode.commands.executeCommand('campfire.chatPanel.focus');
        });
        // Add to subscriptions for proper cleanup
        context.subscriptions.push(generateCodeCommand);
        context.subscriptions.push(reviewCodeCommand);
        context.subscriptions.push(openChatCommand);
        // Listen for configuration changes
        const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('campfire')) {
                configManager.reloadConfiguration();
                const newConfig = configManager.getConfiguration();
                // Update all components that depend on configuration
                partyBoxManager = new partyBoxManager_1.PartyBoxManager(newConfig);
                mcpClient = new mcpClient_1.MCPClient(newConfig);
                chatPanelProvider.updateConfiguration(newConfig);
                commandHandler.updateConfiguration();
            }
        });
        context.subscriptions.push(configChangeListener);
        // Listen for workspace changes
        const workspaceChangeListener = workspaceManager.onWorkspaceChange((workspace) => {
            console.log('Workspace changed:', workspace?.rootPath);
            // Update configuration with new workspace
            const newConfig = configManager.getConfiguration();
            partyBoxManager = new partyBoxManager_1.PartyBoxManager(newConfig);
            mcpClient = new mcpClient_1.MCPClient(newConfig);
            chatPanelProvider.updateConfiguration(newConfig);
        });
        context.subscriptions.push(workspaceChangeListener);
        // Add managers to subscriptions for proper cleanup
        context.subscriptions.push(workspaceManager);
        context.subscriptions.push(terminalManager);
        // Note: fileOperationsManager doesn't need disposal as it has no persistent resources
        // Test MCP connection on startup
        testMCPConnection();
        vscode.window.showInformationMessage('CampfireDevAgent activated successfully!');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to activate CampfireDevAgent:', error);
        vscode.window.showErrorMessage(`Failed to activate CampfireDevAgent: ${errorMessage}`);
    }
}
exports.activate = activate;
/**
 * Test MCP connection on startup
 * Requirements 1.2, 1.3: Test command registration and MCP communication
 */
async function testMCPConnection() {
    try {
        // Test basic MCP connectivity
        const connectionResult = await mcpClient.testConnection();
        if (connectionResult.success) {
            console.log(`MCP connection test successful (${connectionResult.latency}ms):`, connectionResult.message);
        }
        else {
            console.warn('MCP connection test failed:', connectionResult.message);
            vscode.window.showWarningMessage('CampfireValley backend is not responding. Please ensure Docker container is running.', 'View Setup Guide').then(selection => {
                if (selection === 'View Setup Guide') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/campfire-dev-team#setup'));
                }
            });
        }
    }
    catch (error) {
        console.error('MCP connection test error:', error);
    }
}
function deactivate() {
    console.log('CampfireDevAgent is now deactivated');
    // Clean up resources in reverse order of initialization
    try {
        if (backendRequestHandler) {
            backendRequestHandler.clearRequestHistory();
        }
        if (configManager) {
            configManager.dispose();
        }
        // fileOperationsManager doesn't require disposal
        if (workspaceManager) {
            workspaceManager.dispose();
        }
        if (terminalManager) {
            terminalManager.dispose();
        }
    }
    catch (error) {
        console.error('Error during deactivation:', error);
    }
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
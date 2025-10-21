/**
 * Main extension entry point for CampfireDevAgent
 * Based on requirements 1.1, 1.2, 1.3, 1.4, 2.2
 */

import * as vscode from 'vscode';
import { CommandHandler } from './handlers/commandHandler';
import { ConfigurationManager } from './managers/configurationManager';
import { WorkspaceManager } from './managers/workspaceManager';
import { TerminalManager } from './managers/terminalManager';
import { FileOperationsManager } from './managers/fileOperationsManager';
import { BackendRequestHandler } from './managers/backendRequestHandler';
import { PartyBoxManager } from './managers/partyBoxManager';
import { MCPClient } from './handlers/mcpClient';
import { CampfireChatPanelProvider } from './providers/chatPanelProvider';

let commandHandler: CommandHandler;
let configManager: ConfigurationManager;
let workspaceManager: WorkspaceManager;
let terminalManager: TerminalManager;
let fileOperationsManager: FileOperationsManager;
let backendRequestHandler: BackendRequestHandler;
let partyBoxManager: PartyBoxManager;
let mcpClient: MCPClient;
let chatPanelProvider: CampfireChatPanelProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('CampfireDevAgent is now active');

    try {
        // Initialize workspace manager first
        workspaceManager = new WorkspaceManager();
        
        // Initialize terminal manager
        terminalManager = new TerminalManager(workspaceManager);
        
        // Initialize file operations manager
        fileOperationsManager = new FileOperationsManager(workspaceManager);
        
        // Initialize configuration manager with workspace manager
        configManager = new ConfigurationManager(workspaceManager);
        
        // Initialize Party Box manager with configuration
        const config = configManager.getConfiguration();
        partyBoxManager = new PartyBoxManager(config);
        
        // Initialize MCP client with configuration
        mcpClient = new MCPClient(config);
        
        // Initialize backend request handler
        backendRequestHandler = new BackendRequestHandler(
            workspaceManager,
            terminalManager,
            fileOperationsManager
        );
        
        // Initialize command handler with all required dependencies
        commandHandler = new CommandHandler(configManager, workspaceManager, terminalManager);

        // Initialize chat panel provider
        chatPanelProvider = new CampfireChatPanelProvider(context.extensionUri, config);

        // Register webview panel provider
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                CampfireChatPanelProvider.viewType,
                chatPanelProvider
            )
        );

        // Register commands
        const generateCodeCommand = vscode.commands.registerCommand(
            'campfire.generateCode',
            () => commandHandler.handleGenerateCode()
        );

        const reviewCodeCommand = vscode.commands.registerCommand(
            'campfire.reviewCode', 
            () => commandHandler.handleReviewCode()
        );

        const openChatCommand = vscode.commands.registerCommand(
            'campfire.openChat',
            () => {
                vscode.commands.executeCommand('campfire.chatPanel.focus');
            }
        );

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
                partyBoxManager = new PartyBoxManager(newConfig);
                mcpClient = new MCPClient(newConfig);
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
            partyBoxManager = new PartyBoxManager(newConfig);
            mcpClient = new MCPClient(newConfig);
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
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to activate CampfireDevAgent:', error);
        vscode.window.showErrorMessage(`Failed to activate CampfireDevAgent: ${errorMessage}`);
    }
}

/**
 * Test MCP connection on startup
 * Requirements 1.2, 1.3: Test command registration and MCP communication
 */
async function testMCPConnection(): Promise<void> {
    try {
        // Test basic MCP connectivity
        const connectionResult = await mcpClient.testConnection();
        
        if (connectionResult.success) {
            console.log(`MCP connection test successful (${connectionResult.latency}ms):`, connectionResult.message);
        } else {
            console.warn('MCP connection test failed:', connectionResult.message);
            vscode.window.showWarningMessage(
                'CampfireValley backend is not responding. Please ensure Docker container is running.',
                'View Setup Guide'
            ).then(selection => {
                if (selection === 'View Setup Guide') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/campfire-dev-team#setup'));
                }
            });
        }
    } catch (error) {
        console.error('MCP connection test error:', error);
    }
}

export function deactivate() {
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
    } catch (error) {
        console.error('Error during deactivation:', error);
    }
}
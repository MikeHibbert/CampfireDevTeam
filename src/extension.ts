/**
 * Main extension entry point for CampfireDevAgent
 * Based on requirements 1.1, 1.2, 1.3, 1.4, 2.2
 */

import * as vscode from 'vscode';
import { CommandHandler } from './handlers/commandHandler';
import { ConfigurationManager } from './managers/configurationManager';
import { WorkspaceManager } from './managers/workspaceManager';
import { TerminalManager } from './managers/terminalManager';

let commandHandler: CommandHandler;
let configManager: ConfigurationManager;
let workspaceManager: WorkspaceManager;
let terminalManager: TerminalManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('CampfireDevAgent is now active');

    // Initialize workspace manager first
    workspaceManager = new WorkspaceManager();
    
    // Initialize terminal manager
    terminalManager = new TerminalManager(workspaceManager);
    
    // Initialize configuration manager with workspace manager
    configManager = new ConfigurationManager(workspaceManager);
    
    // Initialize command handler with required dependencies
    commandHandler = new CommandHandler(configManager, workspaceManager, terminalManager);

    // Register commands
    const generateCodeCommand = vscode.commands.registerCommand(
        'campfire.generateCode',
        () => commandHandler.handleGenerateCode()
    );

    const reviewCodeCommand = vscode.commands.registerCommand(
        'campfire.reviewCode', 
        () => commandHandler.handleReviewCode()
    );

    // Add to subscriptions for proper cleanup
    context.subscriptions.push(generateCodeCommand);
    context.subscriptions.push(reviewCodeCommand);

    // Listen for configuration changes
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('campfire')) {
            configManager.reloadConfiguration();
            commandHandler.updateConfiguration();
        }
    });

    context.subscriptions.push(configChangeListener);
    
    // Add managers to subscriptions for proper cleanup
    context.subscriptions.push(workspaceManager);
    context.subscriptions.push(terminalManager);
}

export function deactivate() {
    console.log('CampfireDevAgent is now deactivated');
    
    // Clean up resources
    if (configManager) {
        configManager.dispose();
    }
    if (workspaceManager) {
        workspaceManager.dispose();
    }
    if (terminalManager) {
        terminalManager.dispose();
    }
}
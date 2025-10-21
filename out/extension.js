"use strict";
/**
 * Main extension entry point for CampfireDevAgent
 * Based on requirements 1.1, 1.2, 1.3, 1.4, 2.2
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const commandHandler_1 = require("./handlers/commandHandler");
const configurationManager_1 = require("./managers/configurationManager");
const workspaceManager_1 = require("./managers/workspaceManager");
const terminalManager_1 = require("./managers/terminalManager");
let commandHandler;
let configManager;
let workspaceManager;
let terminalManager;
function activate(context) {
    console.log('CampfireDevAgent is now active');
    // Initialize workspace manager first
    workspaceManager = new workspaceManager_1.WorkspaceManager();
    // Initialize terminal manager
    terminalManager = new terminalManager_1.TerminalManager(workspaceManager);
    // Initialize configuration manager with workspace manager
    configManager = new configurationManager_1.ConfigurationManager(workspaceManager);
    // Initialize command handler with required dependencies
    commandHandler = new commandHandler_1.CommandHandler(configManager, workspaceManager, terminalManager);
    // Register commands
    const generateCodeCommand = vscode.commands.registerCommand('campfire.generateCode', () => commandHandler.handleGenerateCode());
    const reviewCodeCommand = vscode.commands.registerCommand('campfire.reviewCode', () => commandHandler.handleReviewCode());
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
exports.activate = activate;
function deactivate() {
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
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
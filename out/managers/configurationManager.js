"use strict";
/**
 * Configuration manager for CampfireDevAgent settings
 * Based on requirements 4.1, 4.2, 4.3, 4.4
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
exports.ConfigurationManager = void 0;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("os"));
const config_1 = require("../types/config");
class ConfigurationManager {
    constructor(workspaceManager) {
        this.disposables = [];
        this.workspaceManager = workspaceManager;
        this.config = this.loadConfiguration();
        this.setupWorkspaceChangeListener();
    }
    loadConfiguration() {
        const vsCodeConfig = vscode.workspace.getConfiguration('campfire');
        const config = {
            mcpServer: vsCodeConfig.get('mcpServer', config_1.DEFAULT_CONFIG.mcpServer),
            partyBoxPath: vsCodeConfig.get('partyBoxPath', config_1.DEFAULT_CONFIG.partyBoxPath),
            defaultPrompt: vsCodeConfig.get('defaultPrompt', config_1.DEFAULT_CONFIG.defaultPrompt),
            workspaceRoot: this.getWorkspaceRoot(),
            osType: this.detectOperatingSystem()
        };
        const validation = this.validateConfiguration(config);
        if (!validation.isValid) {
            vscode.window.showErrorMessage(`Invalid Campfire configuration: ${validation.errors.join(', ')}`);
        }
        return config;
    }
    reloadConfiguration() {
        this.config = this.loadConfiguration();
        vscode.window.showInformationMessage('Campfire configuration reloaded');
    }
    getConfiguration() {
        return { ...this.config };
    }
    getWorkspaceRoot() {
        return this.workspaceManager.getWorkspaceRoot() || undefined;
    }
    detectOperatingSystem() {
        const platform = os.platform();
        switch (platform) {
            case 'win32':
                return 'windows';
            case 'darwin':
                return 'macos';
            default:
                return 'linux';
        }
    }
    validateConfiguration(config) {
        const errors = [];
        // Validate MCP server URL
        try {
            new URL(config.mcpServer);
        }
        catch {
            errors.push('Invalid MCP server URL');
        }
        // Validate Party Box path
        if (!config.partyBoxPath || config.partyBoxPath.trim() === '') {
            errors.push('Party Box path cannot be empty');
        }
        // Validate default prompt
        if (!config.defaultPrompt || config.defaultPrompt.trim() === '') {
            errors.push('Default prompt cannot be empty');
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    /**
     * Setup workspace change listener to update configuration
     * Requirement 15.4: Update backend configuration when workspace changes
     */
    setupWorkspaceChangeListener() {
        const workspaceChangeListener = this.workspaceManager.onWorkspaceChange(async (workspace) => {
            const previousRoot = this.config.workspaceRoot;
            const newRoot = workspace?.rootPath;
            if (previousRoot !== newRoot) {
                this.config.workspaceRoot = newRoot;
                console.log('Configuration updated with new workspace root:', newRoot);
                // Notify backend of workspace change
                await this.workspaceManager.notifyBackendWorkspaceChange();
            }
        });
        this.disposables.push(workspaceChangeListener);
    }
    updateWorkspaceRoot(newRoot) {
        this.config.workspaceRoot = newRoot;
        // TODO: Notify backend of workspace change - will be implemented in subsequent tasks
    }
    /**
     * Dispose of all resources
     */
    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
exports.ConfigurationManager = ConfigurationManager;
//# sourceMappingURL=configurationManager.js.map
/**
 * Configuration manager for CampfireDevAgent settings
 * Based on requirements 4.1, 4.2, 4.3, 4.4
 */

import * as vscode from 'vscode';
import * as os from 'os';
import { CampfireConfig, ValidationResult, DEFAULT_CONFIG } from '../types/config';
import { WorkspaceManager } from './workspaceManager';

export class ConfigurationManager {
    private config: CampfireConfig;
    private workspaceManager: WorkspaceManager;
    private disposables: vscode.Disposable[] = [];

    constructor(workspaceManager: WorkspaceManager) {
        this.workspaceManager = workspaceManager;
        this.config = this.loadConfiguration();
        this.setupWorkspaceChangeListener();
    }

    private loadConfiguration(): CampfireConfig {
        const vsCodeConfig = vscode.workspace.getConfiguration('campfire');
        
        const config: CampfireConfig = {
            mcpServer: vsCodeConfig.get('mcpServer', DEFAULT_CONFIG.mcpServer),
            partyBoxPath: vsCodeConfig.get('partyBoxPath', DEFAULT_CONFIG.partyBoxPath),
            defaultPrompt: vsCodeConfig.get('defaultPrompt', DEFAULT_CONFIG.defaultPrompt),
            workspaceRoot: this.getWorkspaceRoot(),
            osType: this.detectOperatingSystem()
        };

        const validation = this.validateConfiguration(config);
        if (!validation.isValid) {
            vscode.window.showErrorMessage(
                `Invalid Campfire configuration: ${validation.errors.join(', ')}`
            );
        }

        return config;
    }

    public reloadConfiguration(): void {
        this.config = this.loadConfiguration();
        vscode.window.showInformationMessage('Campfire configuration reloaded');
    }

    public getConfiguration(): CampfireConfig {
        return { ...this.config };
    }

    private getWorkspaceRoot(): string | undefined {
        return this.workspaceManager.getWorkspaceRoot() || undefined;
    }

    private detectOperatingSystem(): 'windows' | 'linux' | 'macos' {
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

    private validateConfiguration(config: CampfireConfig): ValidationResult {
        const errors: string[] = [];

        // Validate MCP server URL
        try {
            new URL(config.mcpServer);
        } catch {
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
    private setupWorkspaceChangeListener(): void {
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

    public updateWorkspaceRoot(newRoot: string): void {
        this.config.workspaceRoot = newRoot;
        // TODO: Notify backend of workspace change - will be implemented in subsequent tasks
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
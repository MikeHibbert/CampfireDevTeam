/**
 * Configuration manager for CampfireDevAgent settings
 * Based on requirements 4.1, 4.2, 4.3, 4.4
 */

import * as vscode from 'vscode';
import * as os from 'os';
import { CampfireConfig, ValidationResult, ConfigurationError, DEFAULT_CONFIG } from '../types/config';
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
            osType: this.detectOperatingSystem(),
            enableAutoCompletion: vsCodeConfig.get('enableAutoCompletion', DEFAULT_CONFIG.enableAutoCompletion),
            responseTimeout: vsCodeConfig.get('responseTimeout', DEFAULT_CONFIG.responseTimeout),
            retryAttempts: vsCodeConfig.get('retryAttempts', DEFAULT_CONFIG.retryAttempts),
            logLevel: vsCodeConfig.get('logLevel', DEFAULT_CONFIG.logLevel),
            securityValidation: vsCodeConfig.get('securityValidation', DEFAULT_CONFIG.securityValidation),
            workspaceValidation: vsCodeConfig.get('workspaceValidation', DEFAULT_CONFIG.workspaceValidation),
            confirmFileOverwrites: vsCodeConfig.get('confirmFileOverwrites', DEFAULT_CONFIG.confirmFileOverwrites),
            maxFileSize: vsCodeConfig.get('maxFileSize', DEFAULT_CONFIG.maxFileSize)
        };

        const validation = this.validateConfiguration(config);
        if (!validation.isValid) {
            vscode.window.showErrorMessage(
                `Invalid Campfire configuration: ${validation.errors.join(', ')}`
            );
        }

        if (validation.warnings && validation.warnings.length > 0) {
            vscode.window.showWarningMessage(
                `Campfire configuration warnings: ${validation.warnings.join(', ')}`
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
        const warnings: string[] = [];

        // Validate MCP server URL
        try {
            const url = new URL(config.mcpServer);
            if (!['http:', 'https:'].includes(url.protocol)) {
                errors.push('MCP server URL must use HTTP or HTTPS protocol');
            }
            if (url.hostname === 'localhost' && url.port !== '8080') {
                warnings.push('MCP server port is not the default 8080, ensure backend is configured correctly');
            }
        } catch {
            errors.push('Invalid MCP server URL format');
        }

        // Validate Party Box path
        if (!config.partyBoxPath || config.partyBoxPath.trim() === '') {
            errors.push('Party Box path cannot be empty');
        } else {
            // Check for invalid path characters
            const invalidChars = /[<>:"|?*]/;
            if (invalidChars.test(config.partyBoxPath)) {
                errors.push('Party Box path contains invalid characters');
            }
        }

        // Validate default prompt
        if (!config.defaultPrompt || config.defaultPrompt.trim() === '') {
            errors.push('Default prompt cannot be empty');
        } else {
            if (config.defaultPrompt.length < 10) {
                errors.push('Default prompt must be at least 10 characters long');
            }
            if (config.defaultPrompt.length > 500) {
                errors.push('Default prompt cannot exceed 500 characters');
            }
            if (!config.defaultPrompt.includes('{task}')) {
                warnings.push('Default prompt should include {task} placeholder');
            }
            if (!config.defaultPrompt.includes('{os}')) {
                warnings.push('Default prompt should include {os} placeholder');
            }
        }

        // Validate response timeout
        if (config.responseTimeout < 5000 || config.responseTimeout > 120000) {
            errors.push('Response timeout must be between 5 and 120 seconds');
        }

        // Validate retry attempts
        if (config.retryAttempts < 1 || config.retryAttempts > 10) {
            errors.push('Retry attempts must be between 1 and 10');
        }

        // Validate log level
        const validLogLevels = ['error', 'warn', 'info', 'debug'];
        if (!validLogLevels.includes(config.logLevel)) {
            errors.push('Log level must be one of: error, warn, info, debug');
        }

        // Validate max file size
        if (config.maxFileSize < 1024 || config.maxFileSize > 10485760) {
            errors.push('Max file size must be between 1KB and 10MB');
        }

        // Validate workspace root if available
        if (config.workspaceRoot && !this.workspaceManager.isValidWorkspacePath(config.workspaceRoot)) {
            warnings.push('Workspace root path may not be accessible');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
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
     * Update a specific configuration value
     * Requirement 4.4: Allow runtime configuration updates without requiring VS Code restart
     */
    public async updateConfiguration<K extends keyof CampfireConfig>(
        key: K, 
        value: CampfireConfig[K]
    ): Promise<boolean> {
        try {
            const vsCodeConfig = vscode.workspace.getConfiguration('campfire');
            await vsCodeConfig.update(key, value, vscode.ConfigurationTarget.Workspace);
            
            // Update local config
            this.config[key] = value;
            
            // Validate the updated configuration
            const validation = this.validateConfiguration(this.config);
            if (!validation.isValid) {
                vscode.window.showErrorMessage(
                    `Configuration update resulted in invalid state: ${validation.errors.join(', ')}`
                );
                return false;
            }

            vscode.window.showInformationMessage(`Campfire configuration updated: ${key}`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to update configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return false;
        }
    }

    /**
     * Get configuration errors for display
     * Requirement 4.3: Display appropriate error messages when configuration is invalid
     */
    public getConfigurationErrors(): ConfigurationError[] {
        const validation = this.validateConfiguration(this.config);
        const errors: ConfigurationError[] = [];

        validation.errors.forEach(error => {
            errors.push({
                field: this.extractFieldFromError(error),
                message: error,
                severity: 'error'
            });
        });

        if (validation.warnings) {
            validation.warnings.forEach(warning => {
                errors.push({
                    field: this.extractFieldFromError(warning),
                    message: warning,
                    severity: 'warning'
                });
            });
        }

        return errors;
    }

    /**
     * Extract field name from error message for better error reporting
     */
    private extractFieldFromError(errorMessage: string): string {
        if (errorMessage.includes('MCP server')) return 'mcpServer';
        if (errorMessage.includes('Party Box')) return 'partyBoxPath';
        if (errorMessage.includes('prompt')) return 'defaultPrompt';
        if (errorMessage.includes('timeout')) return 'responseTimeout';
        if (errorMessage.includes('retry')) return 'retryAttempts';
        if (errorMessage.includes('log level')) return 'logLevel';
        if (errorMessage.includes('file size')) return 'maxFileSize';
        if (errorMessage.includes('workspace')) return 'workspaceRoot';
        return 'general';
    }

    /**
     * Reset configuration to defaults
     * Requirement 4.2: Provide configuration management functionality
     */
    public async resetToDefaults(): Promise<void> {
        try {
            const vsCodeConfig = vscode.workspace.getConfiguration('campfire');
            
            // Reset all configuration values to defaults
            for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
                if (key !== 'workspaceRoot' && key !== 'osType') {
                    await vsCodeConfig.update(key, value, vscode.ConfigurationTarget.Workspace);
                }
            }

            // Reload configuration
            this.reloadConfiguration();
            vscode.window.showInformationMessage('Campfire configuration reset to defaults');
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to reset configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Export current configuration for backup or sharing
     */
    public exportConfiguration(): string {
        const exportConfig = { ...this.config };
        // Remove runtime-specific values
        delete exportConfig.workspaceRoot;
        delete exportConfig.osType;
        
        return JSON.stringify(exportConfig, null, 2);
    }

    /**
     * Import configuration from JSON string
     */
    public async importConfiguration(configJson: string): Promise<boolean> {
        try {
            const importedConfig = JSON.parse(configJson);
            const vsCodeConfig = vscode.workspace.getConfiguration('campfire');
            
            // Update each valid configuration key
            for (const [key, value] of Object.entries(importedConfig)) {
                if (key in DEFAULT_CONFIG && key !== 'workspaceRoot' && key !== 'osType') {
                    await vsCodeConfig.update(key, value, vscode.ConfigurationTarget.Workspace);
                }
            }

            this.reloadConfiguration();
            vscode.window.showInformationMessage('Campfire configuration imported successfully');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to import configuration: ${error instanceof Error ? error.message : 'Invalid JSON'}`
            );
            return false;
        }
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
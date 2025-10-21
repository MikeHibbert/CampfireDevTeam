/**
 * Workspace Manager for CampfireDevAgent
 * Handles workspace detection, configuration, and change monitoring
 * Based on requirements 15.1, 15.4, 15.6, 15.7
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface WorkspaceInfo {
    rootPath: string;
    name: string;
    isValid: boolean;
}

export interface WorkspaceValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export class WorkspaceManager {
    private currentWorkspace: WorkspaceInfo | null = null;
    private workspaceChangeListeners: ((workspace: WorkspaceInfo | null) => void)[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.initializeWorkspace();
        this.setupWorkspaceChangeMonitoring();
    }

    /**
     * Initialize workspace detection and configuration
     * Requirement 15.1: Detect current open root folder in VS Code workspace
     */
    private initializeWorkspace(): void {
        this.currentWorkspace = this.detectCurrentWorkspace();
        
        if (this.currentWorkspace) {
            console.log(`CampfireDevAgent: Workspace detected - ${this.currentWorkspace.name} at ${this.currentWorkspace.rootPath}`);
        } else {
            console.log('CampfireDevAgent: No workspace detected');
        }
    }

    /**
     * Detect the current VS Code workspace
     * Requirement 15.1: Detect current open root folder in VS Code workspace
     */
    private detectCurrentWorkspace(): WorkspaceInfo | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        // Use the first workspace folder as the root
        const rootFolder = workspaceFolders[0];
        const rootPath = rootFolder.uri.fsPath;
        const name = rootFolder.name;

        const validation = this.validateWorkspaceBoundary(rootPath);
        
        return {
            rootPath,
            name,
            isValid: validation.isValid
        };
    }

    /**
     * Validate workspace boundary for security
     * Requirements 15.6, 15.7: Validate file paths within workspace boundary and reject operations outside workspace
     */
    public validateWorkspaceBoundary(targetPath: string): WorkspaceValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!this.currentWorkspace) {
            errors.push('No workspace is currently open');
            return { isValid: false, errors, warnings };
        }

        try {
            // Resolve the target path to absolute path
            const resolvedTargetPath = path.resolve(targetPath);
            const workspaceRootPath = path.resolve(this.currentWorkspace.rootPath);

            // Check if target path is within workspace boundary
            const relativePath = path.relative(workspaceRootPath, resolvedTargetPath);
            
            // If relative path starts with '..' or is absolute, it's outside workspace
            if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                errors.push(`Path '${targetPath}' is outside workspace boundary '${this.currentWorkspace.rootPath}'`);
                return { isValid: false, errors, warnings };
            }

            // Check if the path exists and is accessible
            if (fs.existsSync(resolvedTargetPath)) {
                const stats = fs.statSync(resolvedTargetPath);
                
                // Warn about sensitive directories
                const sensitivePatterns = [
                    /node_modules/i,
                    /\.git/i,
                    /\.vscode/i,
                    /\.env/i,
                    /config/i
                ];

                for (const pattern of sensitivePatterns) {
                    if (pattern.test(relativePath)) {
                        warnings.push(`Accessing sensitive directory: ${relativePath}`);
                        break;
                    }
                }
            }

            return { isValid: true, errors, warnings };

        } catch (error) {
            errors.push(`Error validating path '${targetPath}': ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { isValid: false, errors, warnings };
        }
    }

    /**
     * Check if a file path is within the current workspace
     * Requirement 15.6: Validate that requested file paths exist within configured workspace boundary
     */
    public isPathWithinWorkspace(filePath: string): boolean {
        const validation = this.validateWorkspaceBoundary(filePath);
        return validation.isValid;
    }

    /**
     * Get the current workspace information
     * Requirement 15.1: Detect current open root folder in VS Code workspace
     */
    public getCurrentWorkspace(): WorkspaceInfo | null {
        return this.currentWorkspace ? { ...this.currentWorkspace } : null;
    }

    /**
     * Get workspace root path
     * Requirements 15.1, 15.3: Detect workspace root and use as base path for file references
     */
    public getWorkspaceRoot(): string | null {
        return this.currentWorkspace?.rootPath || null;
    }

    /**
     * Setup workspace change monitoring
     * Requirement 15.4: Update backend configuration when workspace changes
     */
    private setupWorkspaceChangeMonitoring(): void {
        // Monitor workspace folder changes
        const workspaceFoldersChangeListener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            console.log('CampfireDevAgent: Workspace folders changed');
            this.handleWorkspaceChange();
        });

        this.disposables.push(workspaceFoldersChangeListener);
    }

    /**
     * Handle workspace changes
     * Requirement 15.4: Update backend configuration when workspace changes
     */
    private handleWorkspaceChange(): void {
        const previousWorkspace = this.currentWorkspace;
        this.currentWorkspace = this.detectCurrentWorkspace();

        // Check if workspace actually changed
        const workspaceChanged = 
            (!previousWorkspace && this.currentWorkspace) ||
            (previousWorkspace && !this.currentWorkspace) ||
            (previousWorkspace && this.currentWorkspace && 
             previousWorkspace.rootPath !== this.currentWorkspace.rootPath);

        if (workspaceChanged) {
            console.log('CampfireDevAgent: Workspace changed', {
                previous: previousWorkspace?.rootPath || 'none',
                current: this.currentWorkspace?.rootPath || 'none'
            });

            // Notify all listeners about workspace change
            this.notifyWorkspaceChangeListeners();

            // Show user notification
            if (this.currentWorkspace) {
                vscode.window.showInformationMessage(
                    `Campfire workspace changed to: ${this.currentWorkspace.name}`
                );
            } else {
                vscode.window.showWarningMessage(
                    'Campfire: No workspace detected. Some features may be limited.'
                );
            }
        }
    }

    /**
     * Add listener for workspace changes
     * Requirement 15.4: Update backend configuration when workspace changes
     */
    public onWorkspaceChange(listener: (workspace: WorkspaceInfo | null) => void): vscode.Disposable {
        this.workspaceChangeListeners.push(listener);
        
        // Return disposable to allow cleanup
        return new vscode.Disposable(() => {
            const index = this.workspaceChangeListeners.indexOf(listener);
            if (index >= 0) {
                this.workspaceChangeListeners.splice(index, 1);
            }
        });
    }

    /**
     * Notify all listeners about workspace changes
     */
    private notifyWorkspaceChangeListeners(): void {
        for (const listener of this.workspaceChangeListeners) {
            try {
                listener(this.currentWorkspace);
            } catch (error) {
                console.error('Error in workspace change listener:', error);
            }
        }
    }

    /**
     * Resolve a relative path to absolute path within workspace
     * Requirement 15.3: Use workspace root as base path for file references
     */
    public resolveWorkspacePath(relativePath: string): string | null {
        if (!this.currentWorkspace) {
            return null;
        }

        const absolutePath = path.resolve(this.currentWorkspace.rootPath, relativePath);
        
        // Validate the resolved path is within workspace
        if (this.isPathWithinWorkspace(absolutePath)) {
            return absolutePath;
        }

        return null;
    }

    /**
     * Get relative path from workspace root
     * Requirement 15.5: Make Party Box file references relative to workspace root
     */
    public getRelativePathFromWorkspace(absolutePath: string): string | null {
        if (!this.currentWorkspace) {
            return null;
        }

        try {
            const relativePath = path.relative(this.currentWorkspace.rootPath, absolutePath);
            
            // Ensure the path is within workspace
            if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
                return relativePath;
            }
        } catch (error) {
            console.error('Error getting relative path:', error);
        }

        return null;
    }

    /**
     * Notify backend of workspace configuration change
     * Requirement 15.4: Update backend configuration when workspace changes
     * This method will be used by other components to notify the backend
     */
    public async notifyBackendWorkspaceChange(): Promise<void> {
        if (!this.currentWorkspace) {
            console.log('CampfireDevAgent: No workspace to configure for backend');
            return;
        }

        try {
            // TODO: This will be implemented when the MCP communication is set up in later tasks
            // For now, we just log the workspace information that would be sent
            console.log('CampfireDevAgent: Would notify backend of workspace change:', {
                workspaceRoot: this.currentWorkspace.rootPath,
                workspaceName: this.currentWorkspace.name,
                isValid: this.currentWorkspace.isValid
            });
        } catch (error) {
            console.error('Error notifying backend of workspace change:', error);
            vscode.window.showErrorMessage(
                `Failed to update backend workspace configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
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
        this.workspaceChangeListeners = [];
    }
}
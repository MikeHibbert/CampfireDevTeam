"use strict";
/**
 * Workspace Manager for CampfireDevAgent
 * Handles workspace detection, configuration, and change monitoring
 * Based on requirements 15.1, 15.4, 15.6, 15.7
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
exports.WorkspaceManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class WorkspaceManager {
    constructor() {
        this.currentWorkspace = null;
        this.workspaceChangeListeners = [];
        this.disposables = [];
        this.initializeWorkspace();
        this.setupWorkspaceChangeMonitoring();
    }
    /**
     * Initialize workspace detection and configuration
     * Requirement 15.1: Detect current open root folder in VS Code workspace
     */
    initializeWorkspace() {
        this.currentWorkspace = this.detectCurrentWorkspace();
        if (this.currentWorkspace) {
            console.log(`CampfireDevAgent: Workspace detected - ${this.currentWorkspace.name} at ${this.currentWorkspace.rootPath}`);
        }
        else {
            console.log('CampfireDevAgent: No workspace detected');
        }
    }
    /**
     * Detect the current VS Code workspace
     * Requirement 15.1: Detect current open root folder in VS Code workspace
     */
    detectCurrentWorkspace() {
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
    validateWorkspaceBoundary(targetPath) {
        const errors = [];
        const warnings = [];
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
        }
        catch (error) {
            errors.push(`Error validating path '${targetPath}': ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { isValid: false, errors, warnings };
        }
    }
    /**
     * Check if a file path is within the current workspace
     * Requirement 15.6: Validate that requested file paths exist within configured workspace boundary
     */
    isPathWithinWorkspace(filePath) {
        const validation = this.validateWorkspaceBoundary(filePath);
        return validation.isValid;
    }
    /**
     * Check if a workspace path is valid and accessible
     * Used by ConfigurationManager for validation
     */
    isValidWorkspacePath(workspacePath) {
        try {
            return fs.existsSync(workspacePath) && fs.statSync(workspacePath).isDirectory();
        }
        catch {
            return false;
        }
    }
    /**
     * Get the current workspace information
     * Requirement 15.1: Detect current open root folder in VS Code workspace
     */
    getCurrentWorkspace() {
        return this.currentWorkspace ? { ...this.currentWorkspace } : null;
    }
    /**
     * Get workspace root path
     * Requirements 15.1, 15.3: Detect workspace root and use as base path for file references
     */
    getWorkspaceRoot() {
        return this.currentWorkspace?.rootPath || null;
    }
    /**
     * Setup workspace change monitoring
     * Requirement 15.4: Update backend configuration when workspace changes
     */
    setupWorkspaceChangeMonitoring() {
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
    handleWorkspaceChange() {
        const previousWorkspace = this.currentWorkspace;
        this.currentWorkspace = this.detectCurrentWorkspace();
        // Check if workspace actually changed
        const workspaceChanged = (!previousWorkspace && this.currentWorkspace) ||
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
                vscode.window.showInformationMessage(`Campfire workspace changed to: ${this.currentWorkspace.name}`);
            }
            else {
                vscode.window.showWarningMessage('Campfire: No workspace detected. Some features may be limited.');
            }
        }
    }
    /**
     * Add listener for workspace changes
     * Requirement 15.4: Update backend configuration when workspace changes
     */
    onWorkspaceChange(listener) {
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
    notifyWorkspaceChangeListeners() {
        for (const listener of this.workspaceChangeListeners) {
            try {
                listener(this.currentWorkspace);
            }
            catch (error) {
                console.error('Error in workspace change listener:', error);
            }
        }
    }
    /**
     * Resolve a relative path to absolute path within workspace
     * Requirement 15.3: Use workspace root as base path for file references
     */
    resolveWorkspacePath(relativePath) {
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
    getRelativePathFromWorkspace(absolutePath) {
        if (!this.currentWorkspace) {
            return null;
        }
        try {
            const relativePath = path.relative(this.currentWorkspace.rootPath, absolutePath);
            // Ensure the path is within workspace
            if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
                return relativePath;
            }
        }
        catch (error) {
            console.error('Error getting relative path:', error);
        }
        return null;
    }
    /**
     * Notify backend of workspace configuration change
     * Requirement 15.4: Update backend configuration when workspace changes
     * This method will be used by other components to notify the backend
     */
    async notifyBackendWorkspaceChange() {
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
        }
        catch (error) {
            console.error('Error notifying backend of workspace change:', error);
            vscode.window.showErrorMessage(`Failed to update backend workspace configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Dispose of all resources
     */
    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.workspaceChangeListeners = [];
    }
}
exports.WorkspaceManager = WorkspaceManager;
//# sourceMappingURL=workspaceManager.js.map
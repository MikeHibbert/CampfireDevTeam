"use strict";
/**
 * Backend Request Handler for CampfireDevAgent
 * Handles bidirectional communication between VS Code plugin and CampfireValley backend
 * Based on requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendRequestHandler = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs/promises");
class BackendRequestHandler {
    constructor(workspaceManager, terminalManager, fileOperationsManager) {
        this.requestHistory = [];
        this.workspaceManager = workspaceManager;
        this.terminalManager = terminalManager;
        this.fileOperationsManager = fileOperationsManager;
    }
    /**
     * Handle incoming backend requests
     * Requirements 14.1, 14.2, 14.3: Respond to directory listing, console output, and code section requests
     */
    async handleBackendRequest(request) {
        try {
            // Validate request
            const validation = this.validateRequest(request);
            if (!validation.isValid) {
                return this.createErrorResponse('INVALID_REQUEST', `Request validation failed: ${validation.errors.join(', ')}`, { validation });
            }
            // Log request for history
            this.addToRequestHistory(request);
            // Route request to appropriate handler
            switch (request.action) {
                case 'list_directory':
                    return await this.handleDirectoryListingRequest(request);
                case 'get_console':
                    return await this.handleConsoleOutputRequest(request);
                case 'get_code_section':
                    return await this.handleCodeSectionRequest(request);
                case 'update_code':
                    return await this.handleCodeUpdateRequest(request);
                default:
                    return this.createErrorResponse('UNKNOWN_ACTION', `Unknown action: ${request.action}`, { action: request.action });
            }
        }
        catch (error) {
            console.error('Error handling backend request:', error);
            return this.createErrorResponse('INTERNAL_ERROR', `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`, { originalRequest: request });
        }
    }
    /**
     * Handle directory listing requests from backend
     * Requirement 14.1: Respond to directory listing requests by providing file and folder contents
     */
    async handleDirectoryListingRequest(request) {
        try {
            const targetPath = request.target_path || request.parameters?.path;
            if (!targetPath) {
                return {
                    success: false,
                    path: '',
                    entries: [],
                    error: 'No target path specified for directory listing'
                };
            }
            // Resolve path relative to workspace
            const resolvedPath = this.resolveWorkspacePath(targetPath);
            if (!resolvedPath) {
                return {
                    success: false,
                    path: targetPath,
                    entries: [],
                    error: 'Path is outside workspace boundary or workspace not available'
                };
            }
            // Check if path exists
            try {
                const stats = await fs.stat(resolvedPath);
                if (!stats.isDirectory()) {
                    return {
                        success: false,
                        path: targetPath,
                        entries: [],
                        error: 'Target path is not a directory'
                    };
                }
            }
            catch (error) {
                return {
                    success: false,
                    path: targetPath,
                    entries: [],
                    error: `Directory does not exist: ${targetPath}`
                };
            }
            // Read directory contents
            const entries = await this.readDirectoryContents(resolvedPath, targetPath);
            return {
                success: true,
                path: targetPath,
                entries
            };
        }
        catch (error) {
            return {
                success: false,
                path: request.target_path || '',
                entries: [],
                error: `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Read directory contents and create directory entries
     */
    async readDirectoryContents(absolutePath, relativePath) {
        const entries = [];
        try {
            const dirEntries = await fs.readdir(absolutePath, { withFileTypes: true });
            for (const entry of dirEntries) {
                // Skip hidden files and system directories unless specifically requested
                if (this.shouldSkipEntry(entry.name)) {
                    continue;
                }
                const entryPath = path.join(absolutePath, entry.name);
                const entryRelativePath = path.join(relativePath, entry.name);
                try {
                    const stats = await fs.stat(entryPath);
                    entries.push({
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file',
                        size: entry.isFile() ? stats.size : undefined,
                        modified: stats.mtime.toISOString(),
                        relativePath: entryRelativePath
                    });
                }
                catch (statError) {
                    // Skip entries we can't stat (permission issues, etc.)
                    console.warn(`Could not stat ${entryPath}:`, statError);
                }
            }
            // Sort entries: directories first, then files, both alphabetically
            entries.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
        }
        catch (error) {
            console.error(`Error reading directory ${absolutePath}:`, error);
        }
        return entries;
    }
    /**
     * Check if directory entry should be skipped
     */
    shouldSkipEntry(name) {
        const skipPatterns = [
            /^\.git$/,
            /^\.vscode$/,
            /^node_modules$/,
            /^__pycache__$/,
            /^\.pytest_cache$/,
            /^\.env$/,
            /^\.DS_Store$/,
            /^Thumbs\.db$/
        ];
        return skipPatterns.some(pattern => pattern.test(name));
    }
    /**
     * Handle console output requests from backend
     * Requirement 14.2: Capture and return terminal text content when requested by backend
     */
    async handleConsoleOutputRequest(request) {
        try {
            const lines = request.parameters?.lines || 20;
            const maxLines = Math.min(Math.max(1, lines), 100); // Limit between 1-100 lines
            // Get recent terminal output
            const output = this.terminalManager.getRecentOutput(maxLines);
            return {
                success: true,
                output,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            return {
                success: false,
                output: [],
                timestamp: new Date().toISOString(),
                error: `Failed to get console output: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Handle code section requests from backend
     * Requirement 14.3: Respond to code section listing requests by providing specific portions of source files
     */
    async handleCodeSectionRequest(request) {
        try {
            const targetPath = request.target_path || request.parameters?.path;
            if (!targetPath) {
                return {
                    success: false,
                    filePath: '',
                    content: '',
                    error: 'No target path specified for code section request'
                };
            }
            // Resolve path relative to workspace
            const resolvedPath = this.resolveWorkspacePath(targetPath);
            if (!resolvedPath) {
                return {
                    success: false,
                    filePath: targetPath,
                    content: '',
                    error: 'File path is outside workspace boundary or workspace not available'
                };
            }
            // Check if file exists and is readable
            try {
                const stats = await fs.stat(resolvedPath);
                if (!stats.isFile()) {
                    return {
                        success: false,
                        filePath: targetPath,
                        content: '',
                        error: 'Target path is not a file'
                    };
                }
            }
            catch (error) {
                return {
                    success: false,
                    filePath: targetPath,
                    content: '',
                    error: `File does not exist: ${targetPath}`
                };
            }
            // Read file content
            const content = await fs.readFile(resolvedPath, 'utf-8');
            // Handle line range if specified
            const startLine = request.parameters?.start_line;
            const endLine = request.parameters?.end_line;
            if (startLine !== undefined || endLine !== undefined) {
                const lines = content.split('\n');
                const start = Math.max(0, (startLine || 1) - 1); // Convert to 0-based index
                const end = endLine ? Math.min(lines.length, endLine) : lines.length;
                const sectionContent = lines.slice(start, end).join('\n');
                return {
                    success: true,
                    filePath: targetPath,
                    content: sectionContent,
                    startLine: start + 1,
                    endLine: end
                };
            }
            return {
                success: true,
                filePath: targetPath,
                content
            };
        }
        catch (error) {
            return {
                success: false,
                filePath: request.target_path || '',
                content: '',
                error: `Failed to read code section: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Validate backend request for security and scope
     * Requirement 14.5: Validate backend requests for security and scope before execution
     */
    validateRequest(request) {
        const errors = [];
        const warnings = [];
        // Validate required fields
        if (!request.action) {
            errors.push('Request action is required');
        }
        if (!request.parameters && !request.target_path) {
            warnings.push('Request has no parameters or target path');
        }
        // Validate action type
        const validActions = ['list_directory', 'get_console', 'get_code_section', 'update_code'];
        if (request.action && !validActions.includes(request.action)) {
            errors.push(`Invalid action: ${request.action}`);
        }
        // Validate path-based requests
        if (['list_directory', 'get_code_section', 'update_code'].includes(request.action)) {
            const targetPath = request.target_path || request.parameters?.path;
            if (!targetPath) {
                errors.push(`Action ${request.action} requires a target path`);
            }
            else {
                // Check for path traversal attempts
                if (this.containsPathTraversal(targetPath)) {
                    errors.push('Path contains potential traversal attack');
                }
                // Validate workspace boundary
                if (!this.workspaceManager.isPathWithinWorkspace(targetPath)) {
                    errors.push('Path is outside workspace boundary');
                }
            }
        }
        // Validate console output parameters
        if (request.action === 'get_console') {
            const lines = request.parameters?.lines;
            if (lines !== undefined && (typeof lines !== 'number' || lines < 1 || lines > 100)) {
                errors.push('Console output lines parameter must be a number between 1 and 100');
            }
        }
        // Validate code section parameters
        if (request.action === 'get_code_section') {
            const startLine = request.parameters?.start_line;
            const endLine = request.parameters?.end_line;
            if (startLine !== undefined && (typeof startLine !== 'number' || startLine < 1)) {
                errors.push('Start line must be a positive number');
            }
            if (endLine !== undefined && (typeof endLine !== 'number' || endLine < 1)) {
                errors.push('End line must be a positive number');
            }
            if (startLine !== undefined && endLine !== undefined && startLine > endLine) {
                errors.push('Start line cannot be greater than end line');
            }
        }
        // Validate code update parameters
        if (request.action === 'update_code') {
            const { content, operation, start_line, end_line } = request.parameters || {};
            if (content === undefined) {
                errors.push('Code update requires content parameter');
            }
            if (operation && !['create', 'update', 'replace'].includes(operation)) {
                errors.push('Invalid operation type. Must be create, update, or replace');
            }
            if (start_line !== undefined && (typeof start_line !== 'number' || start_line < 1)) {
                errors.push('Start line must be a positive number');
            }
            if (end_line !== undefined && (typeof end_line !== 'number' || end_line < 1)) {
                errors.push('End line must be a positive number');
            }
            if (start_line !== undefined && end_line !== undefined && start_line > end_line) {
                errors.push('Start line cannot be greater than end line');
            }
            // Validate content size (prevent extremely large updates)
            if (typeof content === 'string' && content.length > 1024 * 1024) { // 1MB limit
                warnings.push('Content size is very large (>1MB). Consider breaking into smaller updates.');
            }
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    /**
     * Check for path traversal attempts
     */
    containsPathTraversal(filePath) {
        const normalizedPath = path.normalize(filePath);
        return normalizedPath.includes('..') || normalizedPath.startsWith('/') || /^[a-zA-Z]:/.test(normalizedPath);
    }
    /**
     * Resolve path relative to workspace
     */
    resolveWorkspacePath(relativePath) {
        return this.workspaceManager.resolveWorkspacePath(relativePath);
    }
    /**
     * Create standardized error response
     */
    createErrorResponse(code, message, details = {}) {
        return {
            error: {
                code,
                message,
                details,
                retry_possible: ['INTERNAL_ERROR', 'WORKSPACE_NOT_AVAILABLE'].includes(code)
            }
        };
    }
    /**
     * Add request to history for tracking
     */
    addToRequestHistory(request) {
        this.requestHistory.push(request);
        // Keep only last 50 requests
        if (this.requestHistory.length > 50) {
            this.requestHistory = this.requestHistory.slice(-50);
        }
    }
    /**
     * Get request history for debugging
     */
    getRequestHistory() {
        return [...this.requestHistory];
    }
    /**
     * Handle code update requests from backend
     * Requirements 14.4, 14.5, 14.6, 14.7: Perform code updates, validate requests, and provide confirmation responses
     */
    async handleCodeUpdateRequest(request) {
        try {
            const updateRequest = request;
            const { path: targetPath, content, operation = 'update', start_line, end_line, backup = true } = updateRequest.parameters;
            if (!targetPath) {
                return {
                    success: false,
                    filePath: '',
                    operation: 'update',
                    error: 'No target path specified for code update'
                };
            }
            if (!content && content !== '') {
                return {
                    success: false,
                    filePath: targetPath,
                    operation: 'update',
                    error: 'No content specified for code update'
                };
            }
            // Resolve path relative to workspace
            const resolvedPath = this.resolveWorkspacePath(targetPath);
            if (!resolvedPath) {
                return {
                    success: false,
                    filePath: targetPath,
                    operation: 'update',
                    error: 'File path is outside workspace boundary or workspace not available'
                };
            }
            // Check if this is a create operation or file exists
            const fileExists = await this.fileExists(resolvedPath);
            if (operation === 'create' && fileExists) {
                return {
                    success: false,
                    filePath: targetPath,
                    operation: 'create',
                    error: 'File already exists, cannot create'
                };
            }
            if ((operation === 'update' || operation === 'replace') && !fileExists) {
                return {
                    success: false,
                    filePath: targetPath,
                    operation,
                    error: 'File does not exist, cannot update'
                };
            }
            // Perform the appropriate operation
            switch (operation) {
                case 'create':
                    return await this.createNewFile(resolvedPath, targetPath, content);
                case 'replace':
                    return await this.replaceFileContent(resolvedPath, targetPath, content, backup);
                case 'update':
                    return await this.updateFileContent(resolvedPath, targetPath, content, start_line, end_line, backup);
                default:
                    return {
                        success: false,
                        filePath: targetPath,
                        operation: 'update',
                        error: `Unknown operation: ${operation}`
                    };
            }
        }
        catch (error) {
            return {
                success: false,
                filePath: request.target_path || '',
                operation: 'update',
                error: `Failed to update code: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Create a new file with the specified content
     */
    async createNewFile(resolvedPath, targetPath, content) {
        try {
            // Ensure directory exists
            const directory = path.dirname(resolvedPath);
            await fs.mkdir(directory, { recursive: true });
            // Write the file
            await fs.writeFile(resolvedPath, content, 'utf-8');
            // Open the file in VS Code
            try {
                const document = await vscode.workspace.openTextDocument(resolvedPath);
                await vscode.window.showTextDocument(document);
            }
            catch (openError) {
                console.warn('Failed to open created file in editor:', openError);
            }
            return {
                success: true,
                filePath: targetPath,
                operation: 'create',
                linesModified: content.split('\n').length
            };
        }
        catch (error) {
            return {
                success: false,
                filePath: targetPath,
                operation: 'create',
                error: `Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Replace entire file content
     */
    async replaceFileContent(resolvedPath, targetPath, content, createBackup) {
        try {
            let backupCreated = false;
            // Create backup if requested
            if (createBackup) {
                const backupPath = `${resolvedPath}.backup.${Date.now()}`;
                await fs.copyFile(resolvedPath, backupPath);
                backupCreated = true;
            }
            // Replace file content
            await fs.writeFile(resolvedPath, content, 'utf-8');
            return {
                success: true,
                filePath: targetPath,
                operation: 'replace',
                linesModified: content.split('\n').length,
                backupCreated
            };
        }
        catch (error) {
            return {
                success: false,
                filePath: targetPath,
                operation: 'replace',
                error: `Failed to replace file content: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Update specific lines in a file or append content
     */
    async updateFileContent(resolvedPath, targetPath, content, startLine, endLine, createBackup = true) {
        try {
            // Read existing file content
            const existingContent = await fs.readFile(resolvedPath, 'utf-8');
            const existingLines = existingContent.split('\n');
            let backupCreated = false;
            // Create backup if requested
            if (createBackup) {
                const backupPath = `${resolvedPath}.backup.${Date.now()}`;
                await fs.copyFile(resolvedPath, backupPath);
                backupCreated = true;
            }
            let newLines;
            let linesModified;
            if (startLine !== undefined && endLine !== undefined) {
                // Replace specific line range
                const start = Math.max(0, startLine - 1); // Convert to 0-based index
                const end = Math.min(existingLines.length, endLine);
                const contentLines = content.split('\n');
                newLines = [
                    ...existingLines.slice(0, start),
                    ...contentLines,
                    ...existingLines.slice(end)
                ];
                linesModified = contentLines.length;
            }
            else if (startLine !== undefined) {
                // Insert at specific line
                const insertIndex = Math.max(0, startLine - 1);
                const contentLines = content.split('\n');
                newLines = [
                    ...existingLines.slice(0, insertIndex),
                    ...contentLines,
                    ...existingLines.slice(insertIndex)
                ];
                linesModified = contentLines.length;
            }
            else {
                // Append to end of file
                const contentLines = content.split('\n');
                newLines = [...existingLines, ...contentLines];
                linesModified = contentLines.length;
            }
            // Write updated content
            const newContent = newLines.join('\n');
            await fs.writeFile(resolvedPath, newContent, 'utf-8');
            return {
                success: true,
                filePath: targetPath,
                operation: 'update',
                linesModified,
                backupCreated
            };
        }
        catch (error) {
            return {
                success: false,
                filePath: targetPath,
                operation: 'update',
                error: `Failed to update file content: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Provide confirmation response to backend after completing requested actions
     * Requirement 14.6: Provide confirmation responses to the backend after completing requested actions
     */
    createConfirmationResponse(action, success, details = {}) {
        return {
            confirmation: {
                action,
                success,
                timestamp: new Date().toISOString(),
                details
            }
        };
    }
    /**
     * Handle request that cannot be fulfilled
     * Requirement 14.7: Return appropriate error message with reason if request cannot be fulfilled
     */
    createRequestFailureResponse(action, reason, details = {}) {
        const errorCodes = {
            'path_outside_workspace': 'PATH_OUTSIDE_WORKSPACE',
            'file_not_found': 'FILE_NOT_FOUND',
            'permission_denied': 'PERMISSION_DENIED',
            'invalid_parameters': 'INVALID_PARAMETERS',
            'workspace_not_available': 'WORKSPACE_NOT_AVAILABLE',
            'operation_not_supported': 'OPERATION_NOT_SUPPORTED'
        };
        const errorCode = errorCodes[reason.toLowerCase().replace(/\s+/g, '_')] || 'REQUEST_FAILED';
        return this.createErrorResponse(errorCode, reason, { action, ...details });
    }
    /**
     * Clear request history
     */
    clearRequestHistory() {
        this.requestHistory = [];
    }
}
exports.BackendRequestHandler = BackendRequestHandler;
//# sourceMappingURL=backendRequestHandler.js.map
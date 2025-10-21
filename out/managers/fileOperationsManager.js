"use strict";
/**
 * File Operations Manager for CampfireDevAgent
 * Handles file creation, management, and project structure awareness
 * Based on requirements 8.1, 8.2, 8.3, 8.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedFileOperations = exports.FileOperationsManager = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs/promises");
const errorHandler_1 = require("../utils/errorHandler");
class FileOperationsManager {
    constructor(workspaceManager) {
        this.supportedFileTypes = new Map([
            ['.py', {
                    type: 'python',
                    defaultDir: 'src',
                    template: '# Python file\n\n',
                    description: 'Python source file'
                }],
            ['.js', {
                    type: 'javascript',
                    defaultDir: 'src',
                    template: '// JavaScript file\n\n',
                    description: 'JavaScript source file'
                }],
            ['.ts', {
                    type: 'typescript',
                    defaultDir: 'src',
                    template: '// TypeScript file\n\n',
                    description: 'TypeScript source file'
                }],
            ['.html', {
                    type: 'html',
                    defaultDir: 'public',
                    template: '<!DOCTYPE html>\n<html>\n<head>\n    <title></title>\n</head>\n<body>\n\n</body>\n</html>\n',
                    description: 'HTML document'
                }],
            ['.css', {
                    type: 'css',
                    defaultDir: 'public/css',
                    template: '/* CSS file */\n\n',
                    description: 'CSS stylesheet'
                }],
            ['.json', {
                    type: 'json',
                    defaultDir: '.',
                    template: '{\n    \n}\n',
                    description: 'JSON configuration file'
                }],
            ['.md', {
                    type: 'markdown',
                    defaultDir: '.',
                    template: '# Document Title\n\n',
                    description: 'Markdown document'
                }],
            ['.yml', {
                    type: 'yaml',
                    defaultDir: '.',
                    template: '# YAML configuration\n\n',
                    description: 'YAML configuration file'
                }],
            ['.yaml', {
                    type: 'yaml',
                    defaultDir: '.',
                    template: '# YAML configuration\n\n',
                    description: 'YAML configuration file'
                }]
        ]);
        this.workspaceManager = workspaceManager;
        this.errorHandler = errorHandler_1.ErrorHandler.getInstance();
    }
    /**
     * Create new code files in appropriate directories with comprehensive error handling
     * Requirement 8.1: Generate new files with appropriate names and extensions within current workspace
     * Requirement 8.2: Handle file I/O operations safely without overwriting existing files without confirmation
     */
    async createCodeFile(fileName, content, options = {}) {
        try {
            // Validate inputs
            if (!fileName || fileName.trim().length === 0) {
                const validationError = this.errorHandler.handleValidationError(['File name cannot be empty'], 'File creation');
                return {
                    success: false,
                    filePath: fileName,
                    created: false,
                    overwritten: false,
                    error: validationError.userMessage
                };
            }
            // Validate file name
            const fileNameValidation = this.validateFileName(fileName);
            if (!fileNameValidation.isValid) {
                const validationError = this.errorHandler.handleValidationError(fileNameValidation.errors, 'File name validation');
                return {
                    success: false,
                    filePath: fileName,
                    created: false,
                    overwritten: false,
                    error: validationError.userMessage
                };
            }
            // Validate workspace
            const workspaceRoot = this.workspaceManager.getWorkspaceRoot();
            if (!workspaceRoot) {
                const configError = this.errorHandler.handleConfigurationError('workspace', 'No workspace is currently open');
                return {
                    success: false,
                    filePath: fileName,
                    created: false,
                    overwritten: false,
                    error: configError.userMessage
                };
            }
            // Determine appropriate file location
            const suggestedLocation = this.determineFileLocation(fileName);
            const fullPath = path.resolve(workspaceRoot, suggestedLocation);
            // Validate path is within workspace boundary (security check)
            if (!this.workspaceManager.isPathWithinWorkspace(fullPath)) {
                const securityError = this.errorHandler.handleSecurityError('File path is outside workspace boundary', { fileName, suggestedLocation, workspaceRoot });
                return {
                    success: false,
                    filePath: fullPath,
                    created: false,
                    overwritten: false,
                    error: securityError.userMessage
                };
            }
            // Check if file already exists
            const fileExists = await this.fileExists(fullPath);
            let shouldProceed = true;
            let overwritten = false;
            if (fileExists && options.overwriteConfirmation !== false) {
                shouldProceed = await this.confirmOverwrite(fullPath);
                if (shouldProceed) {
                    overwritten = true;
                }
            }
            if (!shouldProceed) {
                return {
                    success: false,
                    filePath: fullPath,
                    created: false,
                    overwritten: false,
                    error: 'File creation cancelled by user'
                };
            }
            // Create directories if needed
            if (options.createDirectories !== false) {
                await this.ensureDirectoryExists(path.dirname(fullPath));
            }
            // Write file with safe I/O and comprehensive error handling
            await this.writeFileSafely(fullPath, content, options.encoding || 'utf-8');
            // Open the created file in VS Code
            await this.openFileInEditor(fullPath);
            // Log successful operation
            console.log(`Successfully created file: ${fullPath}`);
            return {
                success: true,
                filePath: fullPath,
                created: !fileExists,
                overwritten: overwritten,
            };
        }
        catch (error) {
            const fileError = this.errorHandler.handleFileOperationError(error, 'create file', fileName);
            // Display error to user if it's severe
            if (fileError.severity === errorHandler_1.ErrorSeverity.HIGH || fileError.severity === errorHandler_1.ErrorSeverity.CRITICAL) {
                await this.errorHandler.displayError(fileError);
            }
            return {
                success: false,
                filePath: fileName,
                created: false,
                overwritten: false,
                error: fileError.userMessage
            };
        }
    }
    /**
     * Create multiple files from a list
     * Requirement 8.1: Generate new files with appropriate names and extensions within current workspace
     */
    async createMultipleFiles(files, options = {}) {
        const results = [];
        for (const file of files) {
            const result = await this.createCodeFile(file.path, file.content, options);
            results.push(result);
            // If a file creation fails and it's critical, we might want to stop
            if (!result.success && options.overwriteConfirmation !== false) {
                // Show error but continue with other files
                vscode.window.showErrorMessage(`Failed to create ${file.path}: ${result.error}`);
            }
        }
        return results;
    }
    /**
         * Implement safe file I/O with overwrite confirmation
         * Requirement 8.2: Handle file I/O operations safely without overwriting existing files without confirmation
         */
    async writeFileSafely(filePath, content, encoding = 'utf-8') {
        let backupPath = null;
        try {
            // Validate content size to prevent DoS
            const contentSize = Buffer.byteLength(content, encoding);
            const maxFileSize = 50 * 1024 * 1024; // 50MB limit
            if (contentSize > maxFileSize) {
                throw new Error(`File content too large: ${contentSize} bytes (max: ${maxFileSize} bytes)`);
            }
            // Create a backup if file exists
            const fileExists = await this.fileExists(filePath);
            if (fileExists) {
                backupPath = await this.createBackup(filePath);
            }
            // Ensure parent directory exists
            const parentDir = path.dirname(filePath);
            await this.ensureDirectoryExists(parentDir);
            // Write the file atomically (write to temp file first, then rename)
            const tempPath = `${filePath}.tmp.${Date.now()}`;
            try {
                await fs.writeFile(tempPath, content, { encoding, mode: 0o644 });
                // Verify the write was successful
                const writtenContent = await fs.readFile(tempPath, { encoding });
                if (writtenContent !== content) {
                    throw new Error('File content verification failed after write');
                }
                // Atomic rename
                await fs.rename(tempPath, filePath);
                // Clean up backup if write was successful
                if (backupPath) {
                    await fs.unlink(backupPath).catch(() => { }); // Ignore cleanup errors
                }
            }
            catch (writeError) {
                // Clean up temp file
                await fs.unlink(tempPath).catch(() => { }); // Ignore cleanup errors
                throw writeError;
            }
        }
        catch (error) {
            // If write failed and we created a backup, restore it
            if (backupPath && await this.fileExists(backupPath)) {
                try {
                    await fs.copyFile(backupPath, filePath);
                    await fs.unlink(backupPath);
                    console.log(`Restored backup for ${filePath}`);
                }
                catch (restoreError) {
                    console.error('Failed to restore backup:', restoreError);
                    // Don't throw here, let the original error propagate
                }
            }
            // Enhance error with context
            const fileError = this.errorHandler.handleFileOperationError(error, 'write file safely', filePath);
            throw new Error(fileError.technicalMessage);
        }
    }
    /**
     * Create a backup of existing file before overwriting
     */
    async createBackup(filePath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${filePath}.backup.${timestamp}`;
        try {
            await fs.copyFile(filePath, backupPath);
            console.log(`Created backup: ${backupPath}`);
            return backupPath;
        }
        catch (error) {
            const backupError = this.errorHandler.handleFileOperationError(error, 'create backup', filePath);
            console.warn(`Failed to create backup for ${filePath}:`, backupError.technicalMessage);
            throw new Error(`Backup creation failed: ${backupError.userMessage}`);
        }
    }
    /**
     * Confirm with user before overwriting existing files
     * Requirement 8.2: Handle file I/O operations safely without overwriting existing files without confirmation
     */
    async confirmOverwrite(filePath) {
        const relativePath = this.workspaceManager.getRelativePathFromWorkspace(filePath) || filePath;
        const choice = await vscode.window.showWarningMessage(`File "${relativePath}" already exists. Do you want to overwrite it?`, { modal: true }, 'Overwrite', 'Cancel');
        return choice === 'Overwrite';
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
     * Ensure directory exists, create if necessary
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        }
        catch (error) {
            // Ignore error if directory already exists
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
    /**
     * Open file in VS Code editor
     */
    async openFileInEditor(filePath) {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        }
        catch (error) {
            console.warn(`Failed to open file in editor: ${filePath}`, error);
        }
    }
    /**
     * Determine appropriate file location based on file type and project structure
     * Requirement 8.5: Support various file types and create files in appropriate directories
     */
    determineFileLocation(fileName) {
        const extension = path.extname(fileName).toLowerCase();
        const fileTypeInfo = this.supportedFileTypes.get(extension);
        if (!fileTypeInfo) {
            // For unknown file types, place in root or src
            return fileName;
        }
        // Check if filename already includes a directory path
        const dir = path.dirname(fileName);
        if (dir !== '.' && dir !== '') {
            // User specified a directory, use it
            return fileName;
        }
        // Use default directory for file type
        const baseName = path.basename(fileName);
        return path.join(fileTypeInfo.defaultDir, baseName);
    }
    /**
     * Get project structure information for file placement decisions
     * Requirement 8.5: Create logic to determine appropriate file locations based on type
     */
    async getProjectStructureInfo() {
        const workspaceRoot = this.workspaceManager.getWorkspaceRoot();
        if (!workspaceRoot) {
            return {
                directories: [],
                filesByType: {},
                suggestedLocation: '.'
            };
        }
        try {
            const directories = await this.scanDirectories(workspaceRoot);
            const filesByType = await this.categorizeFilesByType(workspaceRoot);
            const suggestedLocation = this.suggestDefaultLocation(directories, filesByType);
            return {
                directories,
                filesByType,
                suggestedLocation
            };
        }
        catch (error) {
            console.error('Failed to analyze project structure:', error);
            return {
                directories: [],
                filesByType: {},
                suggestedLocation: '.'
            };
        }
    }
    /**
     * Scan directories in the workspace
     */
    async scanDirectories(rootPath, maxDepth = 3) {
        const directories = [];
        const scanRecursive = async (currentPath, depth) => {
            if (depth >= maxDepth)
                return;
            try {
                const entries = await fs.readdir(currentPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && !this.shouldIgnoreDirectory(entry.name)) {
                        const fullPath = path.join(currentPath, entry.name);
                        const relativePath = path.relative(rootPath, fullPath);
                        directories.push(relativePath);
                        await scanRecursive(fullPath, depth + 1);
                    }
                }
            }
            catch (error) {
                // Ignore permission errors
            }
        };
        await scanRecursive(rootPath, 0);
        return directories.sort();
    }
    /**
     * Categorize files by type in the workspace
     */
    async categorizeFilesByType(rootPath) {
        const filesByType = {};
        const scanFiles = async (currentPath) => {
            try {
                const entries = await fs.readdir(currentPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentPath, entry.name);
                    if (entry.isFile()) {
                        const extension = path.extname(entry.name).toLowerCase();
                        const fileTypeInfo = this.supportedFileTypes.get(extension);
                        if (fileTypeInfo) {
                            const relativePath = path.relative(rootPath, fullPath);
                            if (!filesByType[fileTypeInfo.type]) {
                                filesByType[fileTypeInfo.type] = [];
                            }
                            filesByType[fileTypeInfo.type].push(relativePath);
                        }
                    }
                    else if (entry.isDirectory() && !this.shouldIgnoreDirectory(entry.name)) {
                        await scanFiles(fullPath);
                    }
                }
            }
            catch (error) {
                // Ignore permission errors
            }
        };
        await scanFiles(rootPath);
        return filesByType;
    }
    /**
     * Suggest default location based on existing project structure
     */
    suggestDefaultLocation(directories, filesByType) {
        // Look for common directory patterns
        const commonDirs = ['src', 'lib', 'app', 'source'];
        for (const commonDir of commonDirs) {
            if (directories.includes(commonDir)) {
                return commonDir;
            }
        }
        // If no common directories found, check if there are any source files
        const hasSourceFiles = Object.keys(filesByType).some(type => ['python', 'javascript', 'typescript'].includes(type));
        return hasSourceFiles ? 'src' : '.';
    }
    /**
     * Check if directory should be ignored during scanning
     */
    shouldIgnoreDirectory(dirName) {
        const ignoredDirs = [
            'node_modules',
            '.git',
            '.vscode',
            '__pycache__',
            '.pytest_cache',
            'dist',
            'build',
            'out',
            '.next',
            'coverage',
            '.nyc_output'
        ];
        return ignoredDirs.includes(dirName) || dirName.startsWith('.');
    }
    /**
       * Get supported file types and their information
       * Requirement 8.5: Support various file types (Python, JavaScript, HTML, CSS, config files)
       */
    getSupportedFileTypes() {
        return new Map(this.supportedFileTypes);
    }
    /**
     * Get file type information for a given file extension
     */
    getFileTypeInfo(fileName) {
        const extension = path.extname(fileName).toLowerCase();
        return this.supportedFileTypes.get(extension);
    }
    /**
     * Suggest file name based on content and type
     */
    suggestFileName(content, fileType) {
        // Extract potential class/function names from content
        const suggestions = this.extractNamesFromContent(content, fileType);
        if (suggestions.length > 0) {
            const baseName = suggestions[0];
            const extension = this.getExtensionForType(fileType);
            return `${baseName}${extension}`;
        }
        // Default naming based on file type
        const extension = this.getExtensionForType(fileType);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        return `generated_${timestamp}${extension}`;
    }
    /**
     * Extract potential names from code content
     */
    extractNamesFromContent(content, fileType) {
        const names = [];
        if (!content)
            return names;
        // Python patterns
        if (fileType === 'python' || content.includes('def ') || content.includes('class ')) {
            const classMatches = content.match(/class\s+(\w+)/g);
            if (classMatches) {
                names.push(...classMatches.map(match => match.replace('class ', '').toLowerCase()));
            }
            const functionMatches = content.match(/def\s+(\w+)/g);
            if (functionMatches) {
                names.push(...functionMatches.map(match => match.replace('def ', '').toLowerCase()));
            }
        }
        // JavaScript/TypeScript patterns
        if (fileType === 'javascript' || fileType === 'typescript' ||
            content.includes('function ') || content.includes('class ')) {
            const classMatches = content.match(/class\s+(\w+)/g);
            if (classMatches) {
                names.push(...classMatches.map(match => match.replace('class ', '').toLowerCase()));
            }
            const functionMatches = content.match(/function\s+(\w+)/g);
            if (functionMatches) {
                names.push(...functionMatches.map(match => match.replace('function ', '').toLowerCase()));
            }
        }
        return names.slice(0, 3); // Return top 3 suggestions
    }
    /**
     * Get file extension for a given file type
     */
    getExtensionForType(fileType) {
        const typeExtensions = {
            'python': '.py',
            'javascript': '.js',
            'typescript': '.ts',
            'html': '.html',
            'css': '.css',
            'json': '.json',
            'markdown': '.md',
            'yaml': '.yml'
        };
        return typeExtensions[fileType || ''] || '.txt';
    }
    /**
     * Validate file name and suggest corrections
     */
    validateFileName(fileName) {
        const errors = [];
        const suggestions = [];
        // Check for invalid characters
        const invalidChars = /[<>:"|?*]/;
        if (invalidChars.test(fileName)) {
            errors.push('File name contains invalid characters: < > : " | ? *');
            suggestions.push(fileName.replace(invalidChars, '_'));
        }
        // Check for reserved names (Windows)
        const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        const baseName = path.basename(fileName, path.extname(fileName)).toUpperCase();
        if (reservedNames.includes(baseName)) {
            errors.push(`File name "${baseName}" is reserved by the system`);
            suggestions.push(`${baseName}_file${path.extname(fileName)}`);
        }
        // Check length
        if (fileName.length > 255) {
            errors.push('File name is too long (maximum 255 characters)');
            const extension = path.extname(fileName);
            const nameWithoutExt = path.basename(fileName, extension);
            suggestions.push(`${nameWithoutExt.slice(0, 255 - extension.length)}${extension}`);
        }
        // Check for spaces at beginning/end
        if (fileName.trim() !== fileName) {
            errors.push('File name has leading or trailing spaces');
            suggestions.push(fileName.trim());
        }
        return {
            isValid: errors.length === 0,
            suggestions: [...new Set(suggestions)],
            errors
        };
    }
    /**
     * Get file creation statistics
     */
    async getFileCreationStats() {
        const workspaceRoot = this.workspaceManager.getWorkspaceRoot();
        if (!workspaceRoot) {
            return {
                totalFiles: 0,
                filesByType: {},
                recentFiles: []
            };
        }
        try {
            const filesByType = await this.categorizeFilesByType(workspaceRoot);
            const totalFiles = Object.values(filesByType).reduce((sum, files) => sum + files.length, 0);
            // Get recent files (modified in last 24 hours)
            const recentFiles = await this.getRecentFiles(workspaceRoot);
            const fileTypeStats = {};
            for (const [type, files] of Object.entries(filesByType)) {
                fileTypeStats[type] = files.length;
            }
            return {
                totalFiles,
                filesByType: fileTypeStats,
                recentFiles
            };
        }
        catch (error) {
            console.error('Failed to get file creation stats:', error);
            return {
                totalFiles: 0,
                filesByType: {},
                recentFiles: []
            };
        }
    }
    /**
     * Get files modified in the last 24 hours
     */
    async getRecentFiles(rootPath) {
        const recentFiles = [];
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const scanForRecent = async (currentPath) => {
            try {
                const entries = await fs.readdir(currentPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentPath, entry.name);
                    if (entry.isFile()) {
                        const stats = await fs.stat(fullPath);
                        if (stats.mtime.getTime() > oneDayAgo) {
                            const relativePath = path.relative(rootPath, fullPath);
                            recentFiles.push(relativePath);
                        }
                    }
                    else if (entry.isDirectory() && !this.shouldIgnoreDirectory(entry.name)) {
                        await scanForRecent(fullPath);
                    }
                }
            }
            catch (error) {
                // Ignore permission errors
            }
        };
        await scanForRecent(rootPath);
        return recentFiles.sort();
    }
}
exports.FileOperationsManager = FileOperationsManager;
/**
 * Advanced file type handling and project structure awareness methods
 * Requirement 8.5: Create logic to determine appropriate file locations based on type
 */
class AdvancedFileOperations {
    constructor(fileOpsManager) {
        this.fileOpsManager = fileOpsManager;
    }
    /**
     * Analyze project structure and suggest optimal file placement
     * Requirement 8.5: Create logic to determine appropriate file locations based on type
     */
    async analyzeProjectStructure() {
        const structureInfo = await this.fileOpsManager.getProjectStructureInfo();
        const workspaceRoot = this.fileOpsManager['workspaceManager'].getWorkspaceRoot();
        if (!workspaceRoot) {
            return this.getDefaultProjectAnalysis();
        }
        // Detect project type based on files and structure
        const projectType = await this.detectProjectType(workspaceRoot, structureInfo);
        // Get directory conventions for this project type
        const conventions = this.getDirectoryConventions(projectType);
        // Analyze existing structure compliance
        const compliance = this.analyzeStructureCompliance(structureInfo, conventions);
        return {
            projectType,
            conventions,
            compliance,
            recommendations: this.generateRecommendations(structureInfo, conventions, compliance)
        };
    }
    /**
     * Detect project type based on files and structure
     */
    async detectProjectType(workspaceRoot, structureInfo) {
        try {
            // Check for specific project indicators
            const packageJsonExists = await this.fileExists(path.join(workspaceRoot, 'package.json'));
            const requirementsTxtExists = await this.fileExists(path.join(workspaceRoot, 'requirements.txt'));
            const pyprojectTomlExists = await this.fileExists(path.join(workspaceRoot, 'pyproject.toml'));
            const cargoTomlExists = await this.fileExists(path.join(workspaceRoot, 'Cargo.toml'));
            const pomXmlExists = await this.fileExists(path.join(workspaceRoot, 'pom.xml'));
            // Analyze file types
            const { filesByType } = structureInfo;
            const hasTypeScript = filesByType.typescript && filesByType.typescript.length > 0;
            const hasJavaScript = filesByType.javascript && filesByType.javascript.length > 0;
            const hasPython = filesByType.python && filesByType.python.length > 0;
            const hasHtml = filesByType.html && filesByType.html.length > 0;
            // Determine project type
            if (packageJsonExists) {
                if (hasTypeScript) {
                    return hasHtml ? 'typescript-web' : 'typescript-node';
                }
                else if (hasJavaScript) {
                    return hasHtml ? 'javascript-web' : 'javascript-node';
                }
                return 'node';
            }
            if (requirementsTxtExists || pyprojectTomlExists || hasPython) {
                return 'python';
            }
            if (cargoTomlExists) {
                return 'rust';
            }
            if (pomXmlExists) {
                return 'java';
            }
            if (hasHtml && (hasJavaScript || hasTypeScript)) {
                return 'web';
            }
            return 'generic';
        }
        catch (error) {
            console.error('Error detecting project type:', error);
            return 'generic';
        }
    }
    /**
     * Get directory conventions for different project types
     */
    getDirectoryConventions(projectType) {
        const conventions = {
            'typescript-web': {
                source: ['src', 'lib'],
                tests: ['tests', '__tests__', 'test'],
                assets: ['public', 'assets', 'static'],
                config: ['config', '.'],
                docs: ['docs', 'documentation'],
                build: ['dist', 'build', 'out']
            },
            'typescript-node': {
                source: ['src', 'lib'],
                tests: ['tests', '__tests__', 'test'],
                assets: ['assets', 'resources'],
                config: ['config', '.'],
                docs: ['docs'],
                build: ['dist', 'build', 'out']
            },
            'javascript-web': {
                source: ['src', 'js', 'scripts'],
                tests: ['tests', 'test'],
                assets: ['public', 'assets', 'static'],
                config: ['.'],
                docs: ['docs'],
                build: ['dist', 'build']
            },
            'javascript-node': {
                source: ['src', 'lib'],
                tests: ['tests', 'test'],
                assets: ['assets'],
                config: ['config', '.'],
                docs: ['docs'],
                build: ['dist', 'build']
            },
            'python': {
                source: ['src', '.'],
                tests: ['tests', 'test'],
                assets: ['assets', 'data'],
                config: ['.'],
                docs: ['docs'],
                build: ['dist', 'build']
            },
            'web': {
                source: ['src', 'js', 'css'],
                tests: ['tests'],
                assets: ['assets', 'images', 'static'],
                config: ['.'],
                docs: ['docs'],
                build: ['dist', 'build']
            },
            'node': {
                source: ['src', 'lib'],
                tests: ['tests', 'test'],
                assets: ['assets'],
                config: ['config', '.'],
                docs: ['docs'],
                build: ['dist', 'build']
            },
            'rust': {
                source: ['src'],
                tests: ['tests'],
                assets: ['assets'],
                config: ['.'],
                docs: ['docs'],
                build: ['target']
            },
            'java': {
                source: ['src/main/java', 'src'],
                tests: ['src/test/java', 'tests'],
                assets: ['src/main/resources', 'resources'],
                config: ['.'],
                docs: ['docs'],
                build: ['target', 'build']
            },
            'generic': {
                source: ['src', '.'],
                tests: ['tests', 'test'],
                assets: ['assets'],
                config: ['.'],
                docs: ['docs'],
                build: ['build', 'dist']
            }
        };
        return conventions[projectType];
    }
    /**
     * Analyze how well the current structure complies with conventions
     */
    analyzeStructureCompliance(structureInfo, conventions) {
        const { directories } = structureInfo;
        const hasSourceDir = conventions.source.some(dir => directories.includes(dir));
        const hasTestDir = conventions.tests.some(dir => directories.includes(dir));
        const hasDocsDir = conventions.docs.some(dir => directories.includes(dir));
        const hasConfigDir = conventions.config.some(dir => directories.includes(dir));
        const score = [hasSourceDir, hasTestDir, hasDocsDir, hasConfigDir]
            .filter(Boolean).length / 4;
        return {
            score,
            hasSourceDir,
            hasTestDir,
            hasDocsDir,
            hasConfigDir,
            missingDirectories: this.findMissingDirectories(directories, conventions)
        };
    }
    /**
     * Find directories that are missing based on conventions
     */
    findMissingDirectories(existingDirs, conventions) {
        const missing = [];
        if (!conventions.source.some(dir => existingDirs.includes(dir))) {
            missing.push(conventions.source[0]);
        }
        if (!conventions.tests.some(dir => existingDirs.includes(dir))) {
            missing.push(conventions.tests[0]);
        }
        if (!conventions.docs.some(dir => existingDirs.includes(dir))) {
            missing.push(conventions.docs[0]);
        }
        return missing;
    }
    /**
     * Generate recommendations for improving project structure
     */
    generateRecommendations(structureInfo, conventions, compliance) {
        const recommendations = [];
        if (!compliance.hasSourceDir) {
            recommendations.push(`Create a source directory: ${conventions.source[0]}`);
        }
        if (!compliance.hasTestDir) {
            recommendations.push(`Create a tests directory: ${conventions.tests[0]}`);
        }
        if (!compliance.hasDocsDir) {
            recommendations.push(`Create a documentation directory: ${conventions.docs[0]}`);
        }
        if (compliance.score < 0.5) {
            recommendations.push('Consider reorganizing files to follow standard project conventions');
        }
        // Check for files in root that should be in subdirectories
        const rootFiles = Object.values(structureInfo.filesByType)
            .flat()
            .filter(file => !file.includes('/') && !file.includes('\\'));
        if (rootFiles.length > 5) {
            recommendations.push('Consider moving source files to a dedicated source directory');
        }
        return recommendations;
    }
    /**
     * Get optimal file location based on file type and project analysis
     */
    async getOptimalFileLocation(fileName, fileType) {
        const analysis = await this.analyzeProjectStructure();
        const extension = path.extname(fileName).toLowerCase();
        const fileTypeInfo = this.fileOpsManager.getFileTypeInfo(fileName);
        // Determine file category
        const category = this.categorizeFile(fileName, fileType, fileTypeInfo);
        // Get appropriate directory based on project conventions
        const targetDir = this.selectTargetDirectory(category, analysis.conventions);
        // Ensure the directory exists in the project
        const finalDir = this.validateAndAdjustDirectory(targetDir, analysis);
        return path.join(finalDir, path.basename(fileName));
    }
    /**
     * Categorize file based on its purpose
     */
    categorizeFile(fileName, fileType, fileTypeInfo) {
        const baseName = path.basename(fileName, path.extname(fileName)).toLowerCase();
        // Test files
        if (baseName.includes('test') || baseName.includes('spec') ||
            fileName.includes('/test') || fileName.includes('\\test')) {
            return 'test';
        }
        // Configuration files
        if (fileTypeInfo?.type === 'json' || fileTypeInfo?.type === 'yaml' ||
            baseName.includes('config') || baseName.includes('settings')) {
            return 'config';
        }
        // Documentation files
        if (fileTypeInfo?.type === 'markdown' || baseName.includes('readme') ||
            baseName.includes('doc')) {
            return 'docs';
        }
        // Asset files
        if (fileTypeInfo?.type === 'html' || fileTypeInfo?.type === 'css' ||
            baseName.includes('style') || baseName.includes('template')) {
            return 'assets';
        }
        // Default to source
        return 'source';
    }
    /**
     * Select target directory based on file category and conventions
     */
    selectTargetDirectory(category, conventions) {
        switch (category) {
            case 'test':
                return conventions.tests[0];
            case 'config':
                return conventions.config[0];
            case 'docs':
                return conventions.docs[0];
            case 'assets':
                return conventions.assets[0];
            case 'source':
            default:
                return conventions.source[0];
        }
    }
    /**
     * Validate directory exists or suggest alternative
     */
    validateAndAdjustDirectory(targetDir, analysis) {
        const workspaceRoot = this.fileOpsManager['workspaceManager'].getWorkspaceRoot();
        if (!workspaceRoot) {
            return '.';
        }
        // If target directory exists, use it
        if (analysis.compliance.hasSourceDir && targetDir === analysis.conventions.source[0]) {
            return targetDir;
        }
        // Try to find existing similar directory
        const structureInfo = analysis.compliance;
        if (targetDir === analysis.conventions.source[0] && !structureInfo.hasSourceDir) {
            // No source directory exists, suggest creating one or use root
            return analysis.recommendations.includes(`Create a source directory: ${targetDir}`) ? '.' : targetDir;
        }
        return targetDir;
    }
    /**
     * Get default project analysis for when no workspace is available
     */
    getDefaultProjectAnalysis() {
        return {
            projectType: 'generic',
            conventions: this.getDirectoryConventions('generic'),
            compliance: {
                score: 0,
                hasSourceDir: false,
                hasTestDir: false,
                hasDocsDir: false,
                hasConfigDir: false,
                missingDirectories: ['src', 'tests', 'docs']
            },
            recommendations: [
                'Open a workspace to get project-specific recommendations',
                'Create a source directory for better organization'
            ]
        };
    }
    /**
     * Helper method to check if file exists
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
}
exports.AdvancedFileOperations = AdvancedFileOperations;
//# sourceMappingURL=fileOperationsManager.js.map
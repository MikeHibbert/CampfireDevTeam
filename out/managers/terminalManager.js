"use strict";
/**
 * Terminal Manager for CampfireDevAgent
 * Handles OS detection and terminal command execution through VS Code's integrated terminal
 * Based on requirements 10.1, 10.2, 10.4, 10.5, 10.6, 10.7
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
exports.TerminalManager = void 0;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("os"));
class TerminalManager {
    constructor(workspaceManager) {
        this.activeTerminal = null;
        this.disposables = [];
        this.commandHistory = [];
        this.outputBuffer = [];
        this.workspaceManager = workspaceManager;
        this.osInfo = this.detectOperatingSystem();
        this.commandFormatter = this.createCommandFormatter();
        this.setupTerminalEventListeners();
    }
    /**
     * Detect host operating system
     * Requirement 10.1: Detect the host operating system
     */
    detectOperatingSystem() {
        const platform = os.platform();
        const version = os.release();
        let type;
        let shell;
        switch (platform) {
            case 'win32':
                type = 'windows';
                shell = 'powershell.exe';
                break;
            case 'darwin':
                type = 'macos';
                shell = '/bin/bash';
                break;
            default:
                type = 'linux';
                shell = '/bin/bash';
                break;
        }
        return {
            type,
            platform,
            version,
            shell
        };
    }
    /**
     * Get operating system information
     * Requirement 10.2: Pass OS information to MCP service
     */
    getOSInfo() {
        return { ...this.osInfo };
    }
    /**
     * Setup terminal event listeners
     * Requirement 10.6: Display command output in VS Code's terminal
     */
    setupTerminalEventListeners() {
        // Listen for terminal close events to clean up references
        const terminalCloseListener = vscode.window.onDidCloseTerminal((terminal) => {
            if (this.activeTerminal === terminal) {
                this.activeTerminal = null;
            }
        });
        this.disposables.push(terminalCloseListener);
    }
    /**
     * Get or create a terminal instance
     * Requirement 10.1: Implement terminal command execution through VS Code's integrated terminal
     */
    getOrCreateTerminal() {
        // Check if active terminal still exists
        if (this.activeTerminal && vscode.window.terminals.includes(this.activeTerminal)) {
            return this.activeTerminal;
        }
        // Create new terminal with appropriate shell
        const terminalOptions = {
            name: 'Campfire Terminal',
            cwd: this.workspaceManager.getWorkspaceRoot() || undefined
        };
        // Set shell based on OS
        if (this.osInfo.type === 'windows') {
            terminalOptions.shellPath = 'powershell.exe';
        }
        else {
            terminalOptions.shellPath = this.osInfo.shell;
        }
        this.activeTerminal = vscode.window.createTerminal(terminalOptions);
        return this.activeTerminal;
    }
    /**
     * Execute a command in the integrated terminal
     * Requirement 10.1: Implement terminal command execution through VS Code's integrated terminal
     * Requirement 10.6: Display command output in VS Code's terminal for developer review
     * Requirement 10.7: Capture and display error messages to the developer
     */
    async executeCommand(command, showTerminal = true) {
        const timestamp = new Date();
        let result;
        try {
            // Validate workspace boundary if command involves file operations
            if (this.containsFileOperations(command)) {
                const workspaceRoot = this.workspaceManager.getWorkspaceRoot();
                if (!workspaceRoot) {
                    throw new Error('No workspace detected. Cannot execute file operations.');
                }
            }
            const terminal = this.getOrCreateTerminal();
            // Format command for the specific OS
            const formattedCommand = this.formatCommandForOS(command);
            // Add error handling to the command
            const commandWithErrorHandling = this.addErrorHandling(formattedCommand);
            // Send command to terminal
            terminal.sendText(commandWithErrorHandling);
            // Show terminal if requested
            if (showTerminal) {
                terminal.show();
            }
            console.log(`CampfireDevAgent: Executed command: ${formattedCommand}`);
            result = {
                success: true,
                command,
                formattedCommand,
                timestamp,
                output: `Command executed: ${formattedCommand}`
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('CampfireDevAgent: Error executing command:', errorMessage);
            // Show error to user
            vscode.window.showErrorMessage(`Failed to execute command: ${errorMessage}`);
            result = {
                success: false,
                command,
                formattedCommand: command,
                timestamp,
                error: errorMessage
            };
        }
        // Add to command history
        this.commandHistory.push(result);
        // Keep only last 50 commands in history
        if (this.commandHistory.length > 50) {
            this.commandHistory = this.commandHistory.slice(-50);
        }
        return result;
    }
    /**
     * Add error handling to command based on OS
     * Requirement 10.7: Handle command output capture and error message display
     */
    addErrorHandling(command) {
        return this.commandFormatter.getErrorHandling() + command;
    }
    /**
     * Create command formatter based on OS
     * Requirements 10.4, 10.5: Create command formatters for Windows PowerShell and Linux/macOS bash
     */
    createCommandFormatter() {
        switch (this.osInfo.type) {
            case 'windows':
                return new WindowsCommandFormatter();
            case 'linux':
            case 'macos':
                return new UnixCommandFormatter();
            default:
                return new UnixCommandFormatter();
        }
    }
    /**
     * Format command for specific operating system
     * Requirements 10.4, 10.5: Use PowerShell commands on Windows, bash/shell commands on Linux/macOS
     */
    formatCommandForOS(command) {
        return this.commandFormatter.formatCommand(command);
    }
    /**
     * Check if command contains file operations
     */
    containsFileOperations(command) {
        const fileOperationPatterns = [
            /\b(cd|mkdir|rmdir|rm|cp|mv|touch|cat|ls|dir)\b/i,
            /[\/\\]/,
            /\.(py|js|ts|html|css|json|md|txt)(\s|$)/i // File extensions
        ];
        return fileOperationPatterns.some(pattern => pattern.test(command));
    }
    /**
     * Execute multiple commands in sequence
     * Requirement 10.1: Implement terminal command execution through VS Code's integrated terminal
     */
    async executeCommands(commands, showTerminal = true) {
        const results = [];
        for (const command of commands) {
            const result = await this.executeCommand(command, showTerminal);
            results.push(result);
            // If a command failed, stop execution and show error
            if (!result.success) {
                vscode.window.showErrorMessage(`Command failed: ${command}. Error: ${result.error}`);
                break;
            }
            // Small delay between commands to ensure proper execution
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return results;
    }
    /**
     * Get command history for context
     * Used for Party Box context information
     */
    getCommandHistory(limit = 10) {
        return this.commandHistory
            .slice(-limit)
            .map(result => {
            if (result.success) {
                return `${result.formattedCommand} # Success`;
            }
            else {
                return `${result.formattedCommand} # Error: ${result.error}`;
            }
        });
    }
    /**
     * Get recent terminal output for backend requests
     * Requirement 14.2: Capture and return terminal text content when requested by backend
     */
    getRecentOutput(lines = 20) {
        return this.outputBuffer.slice(-lines);
    }
    /**
     * Capture output from terminal (simulated for now)
     * In a real implementation, this would capture actual terminal output
     */
    captureOutput(output) {
        this.outputBuffer.push(`[${new Date().toISOString()}] ${output}`);
        // Keep only last 100 lines
        if (this.outputBuffer.length > 100) {
            this.outputBuffer = this.outputBuffer.slice(-100);
        }
    }
    /**
     * Clear the terminal
     */
    clearTerminal() {
        if (this.activeTerminal && vscode.window.terminals.includes(this.activeTerminal)) {
            const clearCommand = this.osInfo.type === 'windows' ? 'Clear-Host' : 'clear';
            this.activeTerminal.sendText(clearCommand);
        }
    }
    /**
     * Focus on the terminal
     */
    focusTerminal() {
        if (this.activeTerminal && vscode.window.terminals.includes(this.activeTerminal)) {
            this.activeTerminal.show();
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
        if (this.activeTerminal) {
            this.activeTerminal.dispose();
            this.activeTerminal = null;
        }
    }
}
exports.TerminalManager = TerminalManager;
/**
 * Windows PowerShell command formatter
 * Requirement 10.4: Create command formatters for Windows PowerShell
 */
class WindowsCommandFormatter {
    formatCommand(command) {
        // Handle common Unix commands and convert to PowerShell equivalents
        const commandMappings = {
            'ls': 'Get-ChildItem',
            'ls -la': 'Get-ChildItem -Force',
            'ls -l': 'Get-ChildItem',
            'cat': 'Get-Content',
            'grep': 'Select-String',
            'find': 'Get-ChildItem -Recurse',
            'pwd': 'Get-Location',
            'mkdir': 'New-Item -ItemType Directory',
            'rm': 'Remove-Item',
            'rm -rf': 'Remove-Item -Recurse -Force',
            'cp': 'Copy-Item',
            'mv': 'Move-Item',
            'touch': 'New-Item -ItemType File',
            'clear': 'Clear-Host',
            'which': 'Get-Command',
            'ps': 'Get-Process',
            'kill': 'Stop-Process',
            'df': 'Get-WmiObject -Class Win32_LogicalDisk',
            'top': 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10'
        };
        // Check for direct command mappings
        const lowerCommand = command.toLowerCase().trim();
        if (commandMappings[lowerCommand]) {
            return commandMappings[lowerCommand];
        }
        // Handle file operations with paths
        if (command.startsWith('ls ')) {
            const path = command.substring(3).trim();
            return `Get-ChildItem "${path}"`;
        }
        if (command.startsWith('cat ')) {
            const path = command.substring(4).trim();
            return `Get-Content "${path}"`;
        }
        if (command.startsWith('mkdir ')) {
            const path = command.substring(6).trim();
            return `New-Item -ItemType Directory -Path "${path}"`;
        }
        // Handle Python execution
        if (command.startsWith('python ') || command.startsWith('python3 ')) {
            return command.replace(/^python3?/, 'python');
        }
        // Handle Docker commands (pass through)
        if (command.startsWith('docker ')) {
            return command;
        }
        // Handle npm/yarn commands (pass through)
        if (command.startsWith('npm ') || command.startsWith('yarn ')) {
            return command;
        }
        // Handle git commands (pass through)
        if (command.startsWith('git ')) {
            return command;
        }
        // Default: return command as-is for PowerShell
        return command;
    }
    getShellPrefix() {
        return 'powershell.exe -Command ';
    }
    getErrorHandling() {
        return '$ErrorActionPreference = "Continue"; ';
    }
}
/**
 * Unix (Linux/macOS) bash command formatter
 * Requirement 10.5: Create command formatters for Linux/macOS bash
 */
class UnixCommandFormatter {
    formatCommand(command) {
        // Handle Windows-specific commands and convert to Unix equivalents
        const commandMappings = {
            'dir': 'ls -la',
            'type': 'cat',
            'copy': 'cp',
            'move': 'mv',
            'del': 'rm',
            'md': 'mkdir',
            'rd': 'rmdir',
            'cls': 'clear'
        };
        // Check for direct command mappings
        const lowerCommand = command.toLowerCase().trim();
        if (commandMappings[lowerCommand]) {
            return commandMappings[lowerCommand];
        }
        // Handle PowerShell commands and convert to Unix equivalents
        if (command.startsWith('Get-ChildItem')) {
            if (command.includes('-Force')) {
                return 'ls -la';
            }
            const match = command.match(/Get-ChildItem\s+"?([^"]+)"?/);
            if (match) {
                return `ls -la "${match[1]}"`;
            }
            return 'ls -la';
        }
        if (command.startsWith('Get-Content')) {
            const match = command.match(/Get-Content\s+"?([^"]+)"?/);
            if (match) {
                return `cat "${match[1]}"`;
            }
            return command.replace('Get-Content', 'cat');
        }
        if (command.startsWith('New-Item -ItemType Directory')) {
            const match = command.match(/-Path\s+"?([^"]+)"?/);
            if (match) {
                return `mkdir -p "${match[1]}"`;
            }
            return command.replace('New-Item -ItemType Directory', 'mkdir -p');
        }
        if (command.startsWith('Remove-Item')) {
            if (command.includes('-Recurse -Force')) {
                return command.replace('Remove-Item -Recurse -Force', 'rm -rf');
            }
            return command.replace('Remove-Item', 'rm');
        }
        // Handle Python execution (ensure python3 on Unix systems)
        if (command.startsWith('python ')) {
            return command.replace(/^python/, 'python3');
        }
        // Handle common development commands (pass through)
        const passthroughPrefixes = ['docker', 'npm', 'yarn', 'git', 'node', 'pip', 'pip3'];
        for (const prefix of passthroughPrefixes) {
            if (command.startsWith(prefix + ' ')) {
                return command;
            }
        }
        // Default: return command as-is for Unix shells
        return command;
    }
    getShellPrefix() {
        return '/bin/bash -c ';
    }
    getErrorHandling() {
        return 'set -e; ';
    }
}
//# sourceMappingURL=terminalManager.js.map
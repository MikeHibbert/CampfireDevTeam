"use strict";
/**
 * Comprehensive Error Handling Utilities for CampfireDevAgent
 * Requirements: 1.5, 8.2, 14.7
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
exports.CircuitBreaker = exports.RetryManager = exports.ErrorHandler = exports.ErrorSeverity = exports.ErrorType = void 0;
const vscode = __importStar(require("vscode"));
var ErrorType;
(function (ErrorType) {
    ErrorType["NETWORK"] = "NETWORK";
    ErrorType["FILE_OPERATION"] = "FILE_OPERATION";
    ErrorType["VALIDATION"] = "VALIDATION";
    ErrorType["CONFIGURATION"] = "CONFIGURATION";
    ErrorType["SECURITY"] = "SECURITY";
    ErrorType["TIMEOUT"] = "TIMEOUT";
    ErrorType["UNKNOWN"] = "UNKNOWN";
})(ErrorType = exports.ErrorType || (exports.ErrorType = {}));
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity = exports.ErrorSeverity || (exports.ErrorSeverity = {}));
class ErrorHandler {
    constructor() {
        this.errorHistory = [];
        this.maxHistorySize = 100;
    }
    static getInstance() {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }
    /**
     * Create a standardized error object
     */
    createError(type, code, message, details, severity = ErrorSeverity.MEDIUM) {
        const error = {
            type,
            severity,
            code,
            message,
            details,
            timestamp: new Date(),
            retryable: this.isRetryableError(type, code),
            userMessage: this.generateUserMessage(type, code, message),
            technicalMessage: message,
            suggestedActions: this.generateSuggestedActions(type, code)
        };
        this.logError(error);
        return error;
    }
    /**
     * Handle network errors with retry logic
     * Requirement 1.5: Handle request/response cycles and error scenarios
     */
    handleNetworkError(error, context = '') {
        let code = 'NETWORK_UNKNOWN';
        let severity = ErrorSeverity.MEDIUM;
        let message = 'Network error occurred';
        if (error instanceof Error) {
            const errorMessage = error.message.toLowerCase();
            if (errorMessage.includes('timeout')) {
                code = 'NETWORK_TIMEOUT';
                message = 'Request timed out';
                severity = ErrorSeverity.HIGH;
            }
            else if (errorMessage.includes('connection refused') || errorMessage.includes('econnrefused')) {
                code = 'NETWORK_CONNECTION_REFUSED';
                message = 'Connection refused by server';
                severity = ErrorSeverity.HIGH;
            }
            else if (errorMessage.includes('network error') || errorMessage.includes('fetch')) {
                code = 'NETWORK_FETCH_ERROR';
                message = 'Network fetch error';
            }
            else if (errorMessage.includes('dns') || errorMessage.includes('enotfound')) {
                code = 'NETWORK_DNS_ERROR';
                message = 'DNS resolution failed';
                severity = ErrorSeverity.HIGH;
            }
            else if (errorMessage.includes('http 500')) {
                code = 'NETWORK_SERVER_ERROR';
                message = 'Server internal error';
                severity = ErrorSeverity.HIGH;
            }
            else if (errorMessage.includes('http 503') || errorMessage.includes('http 502')) {
                code = 'NETWORK_SERVICE_UNAVAILABLE';
                message = 'Service temporarily unavailable';
                severity = ErrorSeverity.HIGH;
            }
        }
        return this.createError(ErrorType.NETWORK, code, `${message}${context ? ` (${context})` : ''}`, { originalError: error instanceof Error ? error.message : String(error) }, severity);
    }
    /**
     * Handle file operation errors
     * Requirement 8.2: Handle file I/O operations safely
     */
    handleFileOperationError(error, operation, filePath) {
        let code = 'FILE_UNKNOWN';
        let severity = ErrorSeverity.MEDIUM;
        let message = `File operation failed: ${operation}`;
        if (error instanceof Error) {
            const errorMessage = error.message.toLowerCase();
            if (errorMessage.includes('permission denied') || errorMessage.includes('eacces')) {
                code = 'FILE_PERMISSION_DENIED';
                message = 'Permission denied';
                severity = ErrorSeverity.HIGH;
            }
            else if (errorMessage.includes('no such file') || errorMessage.includes('enoent')) {
                code = 'FILE_NOT_FOUND';
                message = 'File or directory not found';
            }
            else if (errorMessage.includes('file exists') || errorMessage.includes('eexist')) {
                code = 'FILE_ALREADY_EXISTS';
                message = 'File already exists';
            }
            else if (errorMessage.includes('no space') || errorMessage.includes('enospc')) {
                code = 'FILE_NO_SPACE';
                message = 'Insufficient disk space';
                severity = ErrorSeverity.HIGH;
            }
            else if (errorMessage.includes('too many open files') || errorMessage.includes('emfile')) {
                code = 'FILE_TOO_MANY_OPEN';
                message = 'Too many open files';
                severity = ErrorSeverity.HIGH;
            }
            else if (errorMessage.includes('directory not empty') || errorMessage.includes('enotempty')) {
                code = 'FILE_DIRECTORY_NOT_EMPTY';
                message = 'Directory not empty';
            }
        }
        return this.createError(ErrorType.FILE_OPERATION, code, `${message}: ${operation}${filePath ? ` (${filePath})` : ''}`, {
            operation,
            filePath,
            originalError: error instanceof Error ? error.message : String(error)
        }, severity);
    }
    /**
     * Handle validation errors
     */
    handleValidationError(validationErrors, context = '') {
        return this.createError(ErrorType.VALIDATION, 'VALIDATION_FAILED', `Validation failed${context ? ` (${context})` : ''}`, { validationErrors }, ErrorSeverity.MEDIUM);
    }
    /**
     * Handle configuration errors
     */
    handleConfigurationError(configKey, reason) {
        return this.createError(ErrorType.CONFIGURATION, 'CONFIG_INVALID', `Configuration error: ${configKey}`, { configKey, reason }, ErrorSeverity.HIGH);
    }
    /**
     * Handle security errors
     */
    handleSecurityError(reason, details) {
        return this.createError(ErrorType.SECURITY, 'SECURITY_VIOLATION', `Security violation: ${reason}`, details, ErrorSeverity.CRITICAL);
    }
    /**
     * Display error to user with appropriate UI
     */
    async displayError(error) {
        const actions = error.retryable ? ['Retry', ...error.suggestedActions, 'Dismiss'] : [...error.suggestedActions, 'Dismiss'];
        let result;
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
                result = await vscode.window.showErrorMessage(`🚨 Critical Error: ${error.userMessage}`, { modal: true }, ...actions);
                break;
            case ErrorSeverity.HIGH:
                result = await vscode.window.showErrorMessage(`❌ ${error.userMessage}`, ...actions);
                break;
            case ErrorSeverity.MEDIUM:
                result = await vscode.window.showWarningMessage(`⚠️ ${error.userMessage}`, ...actions);
                break;
            case ErrorSeverity.LOW:
                result = await vscode.window.showInformationMessage(`ℹ️ ${error.userMessage}`, ...actions);
                break;
        }
        // Log user action
        if (result) {
            console.log(`User selected action: ${result} for error: ${error.code}`);
        }
        return result;
    }
    /**
     * Show error details in a new document
     */
    async showErrorDetails(error) {
        const errorDetails = this.formatErrorDetails(error);
        const document = await vscode.workspace.openTextDocument({
            content: errorDetails,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(document);
    }
    /**
     * Get error statistics
     */
    getErrorStatistics() {
        const byType = {};
        const bySeverity = {};
        // Initialize counters
        Object.values(ErrorType).forEach(type => byType[type] = 0);
        Object.values(ErrorSeverity).forEach(severity => bySeverity[severity] = 0);
        // Count errors
        this.errorHistory.forEach(error => {
            byType[error.type]++;
            bySeverity[error.severity]++;
        });
        // Get recent errors (last 10)
        const recent = this.errorHistory.slice(-10);
        return {
            total: this.errorHistory.length,
            byType,
            bySeverity,
            recent
        };
    }
    /**
     * Clear error history
     */
    clearErrorHistory() {
        this.errorHistory = [];
    }
    /**
     * Export error history for debugging
     */
    exportErrorHistory() {
        return JSON.stringify(this.errorHistory, null, 2);
    }
    isRetryableError(type, code) {
        const retryableCodes = [
            'NETWORK_TIMEOUT',
            'NETWORK_CONNECTION_REFUSED',
            'NETWORK_FETCH_ERROR',
            'NETWORK_SERVICE_UNAVAILABLE',
            'NETWORK_SERVER_ERROR',
            'FILE_PERMISSION_DENIED',
            'FILE_NO_SPACE'
        ];
        return retryableCodes.includes(code) || type === ErrorType.NETWORK;
    }
    generateUserMessage(type, code, message) {
        const userMessages = {
            'NETWORK_TIMEOUT': 'The CampfireValley backend is taking too long to respond. Please try again.',
            'NETWORK_CONNECTION_REFUSED': 'Cannot connect to CampfireValley backend. Please check if the service is running.',
            'NETWORK_DNS_ERROR': 'Cannot resolve the CampfireValley backend address. Please check your network connection.',
            'NETWORK_SERVER_ERROR': 'CampfireValley backend encountered an internal error. Please try again later.',
            'NETWORK_SERVICE_UNAVAILABLE': 'CampfireValley backend is temporarily unavailable. Please try again later.',
            'FILE_PERMISSION_DENIED': 'Permission denied. Please check file permissions or run VS Code as administrator.',
            'FILE_NOT_FOUND': 'The specified file or directory was not found.',
            'FILE_ALREADY_EXISTS': 'A file with this name already exists.',
            'FILE_NO_SPACE': 'Insufficient disk space to complete the operation.',
            'VALIDATION_FAILED': 'The provided data is invalid. Please check your input.',
            'CONFIG_INVALID': 'Configuration is invalid. Please check your settings.',
            'SECURITY_VIOLATION': 'Security check failed. The operation was blocked for safety.'
        };
        return userMessages[code] || message;
    }
    generateSuggestedActions(type, code) {
        const actionMap = {
            'NETWORK_TIMEOUT': ['Check Connection', 'Increase Timeout'],
            'NETWORK_CONNECTION_REFUSED': ['Check Service Status', 'Restart Backend'],
            'NETWORK_DNS_ERROR': ['Check Network', 'Verify URL'],
            'FILE_PERMISSION_DENIED': ['Check Permissions', 'Run as Admin'],
            'FILE_NOT_FOUND': ['Check Path', 'Create Directory'],
            'FILE_NO_SPACE': ['Free Disk Space', 'Choose Different Location'],
            'CONFIG_INVALID': ['Open Settings', 'Reset Configuration'],
            'VALIDATION_FAILED': ['Check Input', 'View Details'],
            'SECURITY_VIOLATION': ['View Details', 'Contact Support']
        };
        return actionMap[code] || ['View Details', 'Report Issue'];
    }
    logError(error) {
        // Add to history
        this.errorHistory.push(error);
        // Maintain history size limit
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
        }
        // Log to console based on severity
        const logMessage = `[${error.type}:${error.code}] ${error.technicalMessage}`;
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
            case ErrorSeverity.HIGH:
                console.error(logMessage, error.details);
                break;
            case ErrorSeverity.MEDIUM:
                console.warn(logMessage, error.details);
                break;
            case ErrorSeverity.LOW:
                console.info(logMessage, error.details);
                break;
        }
    }
    formatErrorDetails(error) {
        return `# Error Details

## Summary
- **Type**: ${error.type}
- **Code**: ${error.code}
- **Severity**: ${error.severity}
- **Timestamp**: ${error.timestamp.toISOString()}
- **Retryable**: ${error.retryable ? 'Yes' : 'No'}

## Messages
- **User Message**: ${error.userMessage}
- **Technical Message**: ${error.technicalMessage}

## Suggested Actions
${error.suggestedActions.map(action => `- ${action}`).join('\n')}

## Technical Details
\`\`\`json
${JSON.stringify(error.details, null, 2)}
\`\`\`

## Error History
This is error #${this.errorHistory.length} in the current session.
`;
    }
}
exports.ErrorHandler = ErrorHandler;
/**
 * Retry mechanism with exponential backoff
 */
class RetryManager {
    static async withRetry(operation, options = {}) {
        const { maxRetries = RetryManager.DEFAULT_MAX_RETRIES, baseDelay = RetryManager.DEFAULT_BASE_DELAY, maxDelay = RetryManager.DEFAULT_MAX_DELAY, retryCondition = () => true, onRetry } = options;
        let lastError;
        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                // Don't retry on the last attempt
                if (attempt > maxRetries) {
                    break;
                }
                // Check if error is retryable
                if (!retryCondition(error)) {
                    break;
                }
                // Calculate delay with exponential backoff
                const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
                // Call retry callback
                if (onRetry) {
                    onRetry(attempt, error);
                }
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
}
exports.RetryManager = RetryManager;
RetryManager.DEFAULT_MAX_RETRIES = 3;
RetryManager.DEFAULT_BASE_DELAY = 1000; // 1 second
RetryManager.DEFAULT_MAX_DELAY = 10000; // 10 seconds
/**
 * Circuit breaker pattern for preventing cascading failures
 */
class CircuitBreaker {
    constructor(failureThreshold = 5, recoveryTimeout = 60000, // 1 minute
    monitoringPeriod = 300000 // 5 minutes
    ) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeout = recoveryTimeout;
        this.monitoringPeriod = monitoringPeriod;
        this.failures = 0;
        this.lastFailureTime = 0;
        this.state = 'CLOSED';
    }
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
                this.state = 'HALF_OPEN';
            }
            else {
                throw new Error('Circuit breaker is OPEN - operation blocked');
            }
        }
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
    getState() {
        return {
            state: this.state,
            failures: this.failures,
            lastFailureTime: this.lastFailureTime
        };
    }
    reset() {
        this.failures = 0;
        this.lastFailureTime = 0;
        this.state = 'CLOSED';
    }
}
exports.CircuitBreaker = CircuitBreaker;
//# sourceMappingURL=errorHandler.js.map
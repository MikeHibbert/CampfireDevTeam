/**
 * Configuration validation utilities for CampfireDevAgent
 * Based on requirements 4.1, 4.2, 4.3, 4.4
 */

import * as fs from 'fs';
import * as path from 'path';
import { CampfireConfig, ValidationResult } from '../types/config';

export class ConfigValidationUtils {
    /**
     * Validate URL format and accessibility
     */
    static validateUrl(url: string): { isValid: boolean; error?: string } {
        try {
            const urlObj = new URL(url);
            
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return { isValid: false, error: 'URL must use HTTP or HTTPS protocol' };
            }

            // Additional validation for localhost URLs
            if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                const port = parseInt(urlObj.port || '80');
                if (port < 1 || port > 65535) {
                    return { isValid: false, error: 'Invalid port number' };
                }
            }

            return { isValid: true };
        } catch {
            return { isValid: false, error: 'Invalid URL format' };
        }
    }

    /**
     * Validate file path format and accessibility
     */
    static validatePath(filePath: string): { isValid: boolean; error?: string; warning?: string } {
        if (!filePath || filePath.trim() === '') {
            return { isValid: false, error: 'Path cannot be empty' };
        }

        // Check for invalid characters
        const invalidChars = /[<>:"|?*]/;
        if (invalidChars.test(filePath)) {
            return { isValid: false, error: 'Path contains invalid characters: < > : " | ? *' };
        }

        // Check for potentially problematic paths
        const problematicPatterns = [
            { pattern: /\.\./g, message: 'Path contains parent directory references (..)' },
            { pattern: /\/\//g, message: 'Path contains double slashes' },
            { pattern: /\s+$/g, message: 'Path has trailing whitespace' }
        ];

        for (const { pattern, message } of problematicPatterns) {
            if (pattern.test(filePath)) {
                return { isValid: true, warning: message };
            }
        }

        return { isValid: true };
    }

    /**
     * Validate prompt template format
     */
    static validatePromptTemplate(prompt: string): { isValid: boolean; error?: string; warnings?: string[] } {
        if (!prompt || prompt.trim() === '') {
            return { isValid: false, error: 'Prompt cannot be empty' };
        }

        if (prompt.length < 10) {
            return { isValid: false, error: 'Prompt must be at least 10 characters long' };
        }

        if (prompt.length > 500) {
            return { isValid: false, error: 'Prompt cannot exceed 500 characters' };
        }

        const warnings: string[] = [];

        // Check for required placeholders
        if (!prompt.includes('{task}')) {
            warnings.push('Prompt should include {task} placeholder for task description');
        }

        if (!prompt.includes('{os}')) {
            warnings.push('Prompt should include {os} placeholder for operating system');
        }

        // Check for common issues
        if (prompt.includes('{{') || prompt.includes('}}')) {
            warnings.push('Prompt contains double braces which may cause parsing issues');
        }

        const result: { isValid: boolean; error?: string; warnings?: string[] } = { isValid: true };
        if (warnings.length > 0) {
            result.warnings = warnings;
        }

        return result;
    }

    /**
     * Validate numeric configuration values
     */
    static validateNumericRange(
        value: number, 
        min: number, 
        max: number, 
        fieldName: string
    ): { isValid: boolean; error?: string } {
        if (typeof value !== 'number' || isNaN(value)) {
            return { isValid: false, error: `${fieldName} must be a valid number` };
        }

        if (value < min || value > max) {
            return { isValid: false, error: `${fieldName} must be between ${min} and ${max}` };
        }

        return { isValid: true };
    }

    /**
     * Validate enum values
     */
    static validateEnum<T extends string>(
        value: T, 
        validValues: readonly T[], 
        fieldName: string
    ): { isValid: boolean; error?: string } {
        if (!validValues.includes(value)) {
            return { 
                isValid: false, 
                error: `${fieldName} must be one of: ${validValues.join(', ')}` 
            };
        }

        return { isValid: true };
    }

    /**
     * Check if directory exists and is writable
     */
    static async validateDirectoryAccess(dirPath: string): Promise<{ isValid: boolean; error?: string; warning?: string }> {
        try {
            // Check if path exists
            if (!fs.existsSync(dirPath)) {
                // Try to create the directory
                try {
                    fs.mkdirSync(dirPath, { recursive: true });
                    return { isValid: true, warning: `Directory created: ${dirPath}` };
                } catch {
                    return { isValid: false, error: `Cannot create directory: ${dirPath}` };
                }
            }

            // Check if it's a directory
            const stats = fs.statSync(dirPath);
            if (!stats.isDirectory()) {
                return { isValid: false, error: `Path is not a directory: ${dirPath}` };
            }

            // Check write permissions by attempting to create a temporary file
            const testFile = path.join(dirPath, '.campfire-test-write');
            try {
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
                return { isValid: true };
            } catch {
                return { isValid: false, error: `Directory is not writable: ${dirPath}` };
            }

        } catch (error) {
            return { 
                isValid: false, 
                error: `Error accessing directory: ${error instanceof Error ? error.message : 'Unknown error'}` 
            };
        }
    }

    /**
     * Comprehensive configuration validation
     */
    static async validateFullConfiguration(config: CampfireConfig): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate MCP server URL
        const urlValidation = this.validateUrl(config.mcpServer);
        if (!urlValidation.isValid) {
            errors.push(`MCP Server: ${urlValidation.error}`);
        }

        // Validate Party Box path
        const pathValidation = this.validatePath(config.partyBoxPath);
        if (!pathValidation.isValid) {
            errors.push(`Party Box Path: ${pathValidation.error}`);
        } else if (pathValidation.warning) {
            warnings.push(`Party Box Path: ${pathValidation.warning}`);
        }

        // Validate prompt template
        const promptValidation = this.validatePromptTemplate(config.defaultPrompt);
        if (!promptValidation.isValid) {
            errors.push(`Default Prompt: ${promptValidation.error}`);
        } else if (promptValidation.warnings) {
            warnings.push(...promptValidation.warnings.map(w => `Default Prompt: ${w}`));
        }

        // Validate numeric ranges
        const timeoutValidation = this.validateNumericRange(
            config.responseTimeout, 5000, 120000, 'Response Timeout'
        );
        if (!timeoutValidation.isValid) {
            errors.push(timeoutValidation.error!);
        }

        const retryValidation = this.validateNumericRange(
            config.retryAttempts, 1, 10, 'Retry Attempts'
        );
        if (!retryValidation.isValid) {
            errors.push(retryValidation.error!);
        }

        const fileSizeValidation = this.validateNumericRange(
            config.maxFileSize, 1024, 10485760, 'Max File Size'
        );
        if (!fileSizeValidation.isValid) {
            errors.push(fileSizeValidation.error!);
        }

        // Validate log level
        const logLevelValidation = this.validateEnum(
            config.logLevel, 
            ['error', 'warn', 'info', 'debug'] as const, 
            'Log Level'
        );
        if (!logLevelValidation.isValid) {
            errors.push(logLevelValidation.error!);
        }

        // Validate directory access for Party Box path (if absolute path)
        if (path.isAbsolute(config.partyBoxPath)) {
            const dirValidation = await this.validateDirectoryAccess(config.partyBoxPath);
            if (!dirValidation.isValid) {
                errors.push(`Party Box Directory: ${dirValidation.error}`);
            } else if (dirValidation.warning) {
                warnings.push(`Party Box Directory: ${dirValidation.warning}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
}
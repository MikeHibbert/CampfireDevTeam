/**
 * MCP (Model Context Protocol) Client for communicating with CampfireValley backend
 * Based on requirements 1.2, 1.3, 1.5
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { PartyBox, CamperResponse, ErrorResponse } from '../types/partyBox';
import { CampfireConfig } from '../types/config';
import { PartyBoxManager } from '../managers/partyBoxManager';

export class MCPClient {
    private config: CampfireConfig;
    private partyBoxManager: PartyBoxManager;
    private readonly timeout: number = 30000; // 30 seconds timeout
    private readonly maxRetries: number = 3;

    constructor(config: CampfireConfig) {
        this.config = config;
        this.partyBoxManager = new PartyBoxManager(config);
    }

    /**
     * Send torch request to MCP server
     * Requirements 1.2: Send torch to CampfireValley backend with task details
     * Requirements 1.3: Receive generated code within 1 second for small tasks
     */
    async sendTorchRequest(partyBox: PartyBox): Promise<CamperResponse | ErrorResponse> {
        // Validate Party Box before sending
        const validation = this.partyBoxManager.validatePartyBoxPayload(partyBox);
        if (!validation.isValid) {
            return {
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Invalid Party Box: ${validation.errors.join(', ')}`,
                    details: { validation_errors: validation.errors },
                    retry_possible: false
                }
            };
        }

        // Package torch request in MCP format
        const mcpRequest = this.partyBoxManager.packageTorchRequest(partyBox);

        // Send request with retry logic
        return await this.sendWithRetry(mcpRequest);
    }

    /**
     * Send HTTP request with retry logic and error handling
     * Requirements 1.5: Handle request/response cycles and error scenarios
     */
    private async sendWithRetry(
        mcpRequest: any, 
        attempt: number = 1
    ): Promise<CamperResponse | ErrorResponse> {
        try {
            const response = await this.sendHttpRequest(mcpRequest);
            return this.partyBoxManager.parsePartyBoxResponse(response);

        } catch (error) {
            console.error(`MCP request attempt ${attempt} failed:`, error);

            // Check if we should retry
            if (attempt < this.maxRetries && this.isRetryableError(error)) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                await this.sleep(delay);
                return await this.sendWithRetry(mcpRequest, attempt + 1);
            }

            // Return error response
            return {
                error: {
                    code: this.getErrorCode(error),
                    message: this.getErrorMessage(error),
                    details: { 
                        attempt,
                        max_retries: this.maxRetries,
                        original_error: error instanceof Error ? error.message : String(error)
                    },
                    retry_possible: this.isRetryableError(error) && attempt < this.maxRetries
                }
            };
        }
    }

    /**
     * Send HTTP request to MCP server
     */
    private async sendHttpRequest(mcpRequest: any): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                // Validate MCP server URL
                let serverUrl: URL;
                try {
                    serverUrl = new URL(this.config.mcpServer);
                } catch (error) {
                    reject(new Error(`Invalid MCP server URL: ${this.config.mcpServer}`));
                    return;
                }

                // Prepare request data
                const requestData = JSON.stringify(mcpRequest);
                
                // Prepare request options
                const requestOptions = {
                    hostname: serverUrl.hostname,
                    port: serverUrl.port || (serverUrl.protocol === 'https:' ? 443 : 80),
                    path: serverUrl.pathname + serverUrl.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(requestData),
                        'User-Agent': 'CampfireDevAgent/0.0.1',
                        'X-Workspace-Root': this.config.workspaceRoot || '',
                        'X-OS-Type': this.config.osType || 'windows'
                    },
                    timeout: this.timeout
                };

                // Choose http or https module
                const httpModule = serverUrl.protocol === 'https:' ? https : http;

                // Create request
                const req = httpModule.request(requestOptions, (res) => {
                    let responseData = '';

                    res.on('data', (chunk) => {
                        responseData += chunk;
                    });

                    res.on('end', () => {
                        try {
                            // Check response status
                            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}. ${responseData}`));
                                return;
                            }

                            // Parse JSON response
                            const parsedResponse = JSON.parse(responseData);
                            resolve(parsedResponse);

                        } catch (parseError) {
                            reject(new Error(`Failed to parse response JSON: ${parseError}`));
                        }
                    });
                });

                // Handle request errors
                req.on('error', (error) => {
                    reject(new Error(`Network error: Unable to connect to MCP server at ${this.config.mcpServer}. ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error(`Request timeout after ${this.timeout}ms`));
                });

                // Send request data
                req.write(requestData);
                req.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Check if an error is retryable
     */
    private isRetryableError(error: any): boolean {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            // Network errors that might be temporary
            if (message.includes('network error') ||
                message.includes('connection refused') ||
                message.includes('timeout') ||
                message.includes('econnreset') ||
                message.includes('enotfound')) {
                return true;
            }

            // HTTP status codes that might be temporary
            if (message.includes('http 500') ||
                message.includes('http 502') ||
                message.includes('http 503') ||
                message.includes('http 504')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get error code from error object
     */
    private getErrorCode(error: any): string {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('timeout')) {
                return 'TIMEOUT';
            }
            if (message.includes('network error') || message.includes('connection')) {
                return 'CONNECTION_ERROR';
            }
            if (message.includes('http 500')) {
                return 'SERVER_ERROR';
            }
            if (message.includes('http 502') || message.includes('http 503') || message.includes('http 504')) {
                return 'SERVICE_UNAVAILABLE';
            }
            if (message.includes('http 400')) {
                return 'BAD_REQUEST';
            }
            if (message.includes('http 401') || message.includes('http 403')) {
                return 'AUTHENTICATION_ERROR';
            }
            if (message.includes('http 404')) {
                return 'NOT_FOUND';
            }
        }

        return 'UNKNOWN_ERROR';
    }

    /**
     * Get user-friendly error message
     */
    private getErrorMessage(error: any): string {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('timeout')) {
                return 'Request timed out. The CampfireValley backend may be busy or unavailable.';
            }
            if (message.includes('network error') || message.includes('connection')) {
                return 'Unable to connect to CampfireValley backend. Please check if the service is running.';
            }
            if (message.includes('http 500')) {
                return 'CampfireValley backend encountered an internal error.';
            }
            if (message.includes('http 502') || message.includes('http 503') || message.includes('http 504')) {
                return 'CampfireValley backend is temporarily unavailable.';
            }
            if (message.includes('http 400')) {
                return 'Invalid request sent to CampfireValley backend.';
            }
            if (message.includes('http 401') || message.includes('http 403')) {
                return 'Authentication failed with CampfireValley backend.';
            }
            if (message.includes('http 404')) {
                return 'CampfireValley MCP endpoint not found. Please check the server URL configuration.';
            }
            
            return error.message;
        }

        return 'An unknown error occurred while communicating with CampfireValley backend.';
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test connection to MCP server
     */
    async testConnection(): Promise<{ success: boolean; message: string; latency?: number }> {
        const startTime = Date.now();
        
        try {
            // Create a simple test Party Box
            const testPartyBox: PartyBox = {
                torch: {
                    claim: 'generate_code',
                    task: 'connection_test',
                    os: this.config.osType || 'windows',
                    workspace_root: this.config.workspaceRoot || '',
                    attachments: [],
                    context: {
                        project_structure: [],
                        terminal_history: []
                    }
                },
                metadata: {
                    test: true,
                    timestamp: new Date().toISOString()
                }
            };

            const response = await this.sendTorchRequest(testPartyBox);
            const latency = Date.now() - startTime;

            if ('error' in response) {
                return {
                    success: false,
                    message: `Connection test failed: ${response.error.message}`,
                    latency
                };
            }

            return {
                success: true,
                message: 'Successfully connected to CampfireValley backend',
                latency
            };

        } catch (error) {
            const latency = Date.now() - startTime;
            return {
                success: false,
                message: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
                latency
            };
        }
    }

    /**
     * Update configuration
     */
    updateConfiguration(config: CampfireConfig): void {
        this.config = config;
        this.partyBoxManager = new PartyBoxManager(config);
    }

    /**
     * Get current configuration
     */
    getConfiguration(): CampfireConfig {
        return { ...this.config };
    }
}
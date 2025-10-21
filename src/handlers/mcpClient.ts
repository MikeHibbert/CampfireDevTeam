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
import { ErrorHandler, ErrorType, RetryManager, CircuitBreaker } from '../utils/errorHandler';

export class MCPClient {
    private config: CampfireConfig;
    private partyBoxManager: PartyBoxManager;
    private readonly timeout: number = 30000; // 30 seconds timeout
    private readonly maxRetries: number = 3;
    private readonly errorHandler: ErrorHandler;
    private readonly circuitBreaker: CircuitBreaker;

    constructor(config: CampfireConfig) {
        this.config = config;
        this.partyBoxManager = new PartyBoxManager(config);
        this.errorHandler = ErrorHandler.getInstance();
        this.circuitBreaker = new CircuitBreaker(5, 60000, 300000); // 5 failures, 1 min recovery, 5 min monitoring
    }

    /**
     * Send torch request to MCP server
     * Requirements 1.2: Send torch to CampfireValley backend with task details
     * Requirements 1.3: Receive generated code within 1 second for small tasks
     */
    async sendTorchRequest(partyBox: PartyBox): Promise<CamperResponse | ErrorResponse> {
        try {
            // Validate Party Box before sending
            const validation = this.partyBoxManager.validatePartyBoxPayload(partyBox);
            if (!validation.isValid) {
                const validationError = this.errorHandler.handleValidationError(
                    validation.errors,
                    'Party Box validation'
                );
                
                return {
                    error: {
                        code: validationError.code,
                        message: validationError.userMessage,
                        details: { validation_errors: validation.errors },
                        retry_possible: false
                    }
                };
            }

            // Package torch request in MCP format
            const mcpRequest = this.partyBoxManager.packageTorchRequest(partyBox);

            // Send request with circuit breaker and retry logic
            return await this.circuitBreaker.execute(async () => {
                return await RetryManager.withRetry(
                    () => this.sendHttpRequest(mcpRequest),
                    {
                        maxRetries: this.maxRetries,
                        baseDelay: 1000,
                        maxDelay: 10000,
                        retryCondition: (error) => this.isRetryableError(error),
                        onRetry: (attempt, error) => {
                            console.log(`MCP request retry attempt ${attempt}: ${error.message}`);
                            vscode.window.showInformationMessage(
                                `Retrying connection to CampfireValley (attempt ${attempt}/${this.maxRetries})...`
                            );
                        }
                    }
                ).then(response => this.partyBoxManager.parsePartyBoxResponse(response));
            });

        } catch (error) {
            const campfireError = this.errorHandler.handleNetworkError(error, 'MCP torch request');
            
            return {
                error: {
                    code: campfireError.code,
                    message: campfireError.userMessage,
                    details: campfireError.details,
                    retry_possible: campfireError.retryable
                }
            };
        }
    }

    /**
     * Enhanced HTTP request with comprehensive error handling
     * Requirements 1.5: Handle request/response cycles and error scenarios
     */

    /**
     * Send HTTP request to MCP server with enhanced error handling
     */
    private async sendHttpRequest(mcpRequest: any): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                // Validate MCP server URL
                let serverUrl: URL;
                try {
                    serverUrl = new URL(this.config.mcpServer);
                } catch (error) {
                    const configError = this.errorHandler.handleConfigurationError(
                        'mcpServer',
                        `Invalid URL format: ${this.config.mcpServer}`
                    );
                    reject(new Error(configError.technicalMessage));
                    return;
                }

                // Validate request data
                let requestData: string;
                try {
                    requestData = JSON.stringify(mcpRequest);
                    
                    // Check request size (prevent DoS)
                    const requestSize = Buffer.byteLength(requestData, 'utf8');
                    const maxRequestSize = 10 * 1024 * 1024; // 10MB
                    
                    if (requestSize > maxRequestSize) {
                        const sizeError = this.errorHandler.createError(
                            ErrorType.VALIDATION,
                            'REQUEST_TOO_LARGE',
                            `Request size ${requestSize} bytes exceeds maximum ${maxRequestSize} bytes`
                        );
                        reject(new Error(sizeError.technicalMessage));
                        return;
                    }
                } catch (error) {
                    const serializationError = this.errorHandler.createError(
                        ErrorType.VALIDATION,
                        'REQUEST_SERIALIZATION_FAILED',
                        'Failed to serialize request data'
                    );
                    reject(new Error(serializationError.technicalMessage));
                    return;
                }
                
                // Prepare request options with enhanced headers
                const requestOptions = {
                    hostname: serverUrl.hostname,
                    port: serverUrl.port || (serverUrl.protocol === 'https:' ? 443 : 80),
                    path: serverUrl.pathname + serverUrl.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(requestData),
                        'User-Agent': 'CampfireDevAgent/1.0.0',
                        'X-Workspace-Root': this.config.workspaceRoot || '',
                        'X-OS-Type': this.config.osType || 'windows',
                        'X-Request-ID': this.generateRequestId(),
                        'X-Client-Version': '1.0.0',
                        'Accept': 'application/json',
                        'Accept-Encoding': 'gzip, deflate'
                    },
                    timeout: this.timeout
                };

                // Choose http or https module
                const httpModule = serverUrl.protocol === 'https:' ? https : http;

                // Create request with timeout handling
                const req = httpModule.request(requestOptions, (res) => {
                    let responseData = '';
                    const startTime = Date.now();

                    // Handle response data
                    res.on('data', (chunk) => {
                        responseData += chunk;
                        
                        // Check response size to prevent DoS
                        const maxResponseSize = 50 * 1024 * 1024; // 50MB
                        if (Buffer.byteLength(responseData, 'utf8') > maxResponseSize) {
                            req.destroy();
                            reject(new Error('Response too large'));
                        }
                    });

                    res.on('end', () => {
                        const responseTime = Date.now() - startTime;
                        
                        try {
                            // Log response metrics
                            console.log(`MCP response: ${res.statusCode} in ${responseTime}ms`);
                            
                            // Check response status
                            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                                const httpError = this.errorHandler.handleNetworkError(
                                    new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`),
                                    'HTTP response error'
                                );
                                reject(new Error(`${httpError.technicalMessage}. Response: ${responseData.substring(0, 500)}`));
                                return;
                            }

                            // Parse JSON response with error handling
                            let parsedResponse: any;
                            try {
                                parsedResponse = JSON.parse(responseData);
                            } catch (parseError) {
                                const jsonError = this.errorHandler.createError(
                                    ErrorType.NETWORK,
                                    'RESPONSE_PARSE_ERROR',
                                    'Failed to parse JSON response from server'
                                );
                                reject(new Error(`${jsonError.technicalMessage}: ${parseError}`));
                                return;
                            }

                            // Validate response structure
                            if (typeof parsedResponse !== 'object' || parsedResponse === null) {
                                const structureError = this.errorHandler.createError(
                                    ErrorType.VALIDATION,
                                    'INVALID_RESPONSE_STRUCTURE',
                                    'Server returned invalid response structure'
                                );
                                reject(new Error(structureError.technicalMessage));
                                return;
                            }

                            resolve(parsedResponse);

                        } catch (error) {
                            const processingError = this.errorHandler.createError(
                                ErrorType.NETWORK,
                                'RESPONSE_PROCESSING_ERROR',
                                'Error processing server response'
                            );
                            reject(new Error(`${processingError.technicalMessage}: ${error}`));
                        }
                    });
                });

                // Enhanced error handling
                req.on('error', (error: any) => {
                    let errorMessage = 'Network error occurred';
                    
                    if (error.code === 'ECONNREFUSED') {
                        errorMessage = `Connection refused to ${serverUrl.hostname}:${serverUrl.port}`;
                    } else if (error.code === 'ENOTFOUND') {
                        errorMessage = `DNS lookup failed for ${serverUrl.hostname}`;
                    } else if (error.code === 'ECONNRESET') {
                        errorMessage = 'Connection was reset by the server';
                    } else if (error.code === 'ETIMEDOUT') {
                        errorMessage = 'Connection timed out';
                    }
                    
                    const networkError = this.errorHandler.handleNetworkError(
                        new Error(`${errorMessage}: ${error.message}`),
                        'HTTP request error'
                    );
                    reject(new Error(networkError.technicalMessage));
                });

                req.on('timeout', () => {
                    req.destroy();
                    const timeoutError = this.errorHandler.createError(
                        ErrorType.TIMEOUT,
                        'REQUEST_TIMEOUT',
                        `Request timeout after ${this.timeout}ms`
                    );
                    reject(new Error(timeoutError.technicalMessage));
                });

                // Handle request abortion
                req.on('abort', () => {
                    const abortError = this.errorHandler.createError(
                        ErrorType.NETWORK,
                        'REQUEST_ABORTED',
                        'Request was aborted'
                    );
                    reject(new Error(abortError.technicalMessage));
                });

                // Send request data with error handling
                try {
                    req.write(requestData);
                    req.end();
                } catch (writeError) {
                    const sendError = this.errorHandler.createError(
                        ErrorType.NETWORK,
                        'REQUEST_SEND_ERROR',
                        'Failed to send request data'
                    );
                    reject(new Error(`${sendError.technicalMessage}: ${writeError}`));
                }

            } catch (error) {
                const unexpectedError = this.errorHandler.createError(
                    ErrorType.UNKNOWN,
                    'UNEXPECTED_REQUEST_ERROR',
                    'Unexpected error during request preparation'
                );
                reject(new Error(`${unexpectedError.technicalMessage}: ${error}`));
            }
        });
    }



    /**
     * Test connection to MCP server with comprehensive diagnostics
     */
    async testConnection(): Promise<{ 
        success: boolean; 
        message: string; 
        latency?: number; 
        diagnostics?: any;
        circuitBreakerState?: any;
    }> {
        const startTime = Date.now();
        
        try {
            // Get circuit breaker state
            const circuitBreakerState = this.circuitBreaker.getState();
            
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
                    timestamp: new Date().toISOString(),
                    client_version: '1.0.0'
                }
            };

            // Test basic connectivity first
            const connectivityTest = await this.testBasicConnectivity();
            
            if (!connectivityTest.success) {
                return {
                    success: false,
                    message: connectivityTest.message,
                    latency: Date.now() - startTime,
                    diagnostics: connectivityTest.diagnostics,
                    circuitBreakerState
                };
            }

            // Test full MCP request
            const response = await this.sendTorchRequest(testPartyBox);
            const latency = Date.now() - startTime;

            if ('error' in response) {
                return {
                    success: false,
                    message: `Connection test failed: ${response.error.message}`,
                    latency,
                    diagnostics: {
                        error_code: response.error.code,
                        error_details: response.error.details,
                        retry_possible: response.error.retry_possible
                    },
                    circuitBreakerState
                };
            }

            return {
                success: true,
                message: 'Successfully connected to CampfireValley backend',
                latency,
                diagnostics: {
                    response_type: (response as CamperResponse).response_type,
                    camper_role: (response as CamperResponse).camper_role,
                    confidence_score: (response as CamperResponse).confidence_score
                },
                circuitBreakerState
            };

        } catch (error) {
            const latency = Date.now() - startTime;
            const campfireError = this.errorHandler.handleNetworkError(error, 'Connection test');
            
            return {
                success: false,
                message: campfireError.userMessage,
                latency,
                diagnostics: {
                    error_type: campfireError.type,
                    error_code: campfireError.code,
                    technical_message: campfireError.technicalMessage
                },
                circuitBreakerState: this.circuitBreaker.getState()
            };
        }
    }

    /**
     * Test basic connectivity without full MCP request
     */
    private async testBasicConnectivity(): Promise<{ success: boolean; message: string; diagnostics?: any }> {
        try {
            const serverUrl = new URL(this.config.mcpServer);
            
            // Test if we can reach the health endpoint
            const healthUrl = `${serverUrl.protocol}//${serverUrl.host}/health`;
            
            return new Promise((resolve) => {
                const httpModule = serverUrl.protocol === 'https:' ? https : http;
                
                const req = httpModule.get(healthUrl, { timeout: 5000 }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const healthData = JSON.parse(data);
                                resolve({
                                    success: true,
                                    message: 'Basic connectivity successful',
                                    diagnostics: {
                                        health_status: healthData.status,
                                        server_info: healthData
                                    }
                                });
                            } catch {
                                resolve({
                                    success: true,
                                    message: 'Basic connectivity successful (non-JSON response)',
                                    diagnostics: { response_preview: data.substring(0, 100) }
                                });
                            }
                        } else {
                            resolve({
                                success: false,
                                message: `Health check failed: HTTP ${res.statusCode}`,
                                diagnostics: { status_code: res.statusCode, response: data.substring(0, 200) }
                            });
                        }
                    });
                });

                req.on('error', (error) => {
                    resolve({
                        success: false,
                        message: `Basic connectivity failed: ${error.message}`,
                        diagnostics: { error_code: (error as any).code, error_message: error.message }
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        success: false,
                        message: 'Basic connectivity timeout',
                        diagnostics: { timeout: 5000 }
                    });
                });
            });

        } catch (error) {
            return {
                success: false,
                message: `Invalid server URL: ${this.config.mcpServer}`,
                diagnostics: { url_error: error instanceof Error ? error.message : String(error) }
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

    /**
     * Get error statistics from error handler
     */
    getErrorStatistics() {
        return this.errorHandler.getErrorStatistics();
    }

    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker(): void {
        this.circuitBreaker.reset();
    }

    /**
     * Get circuit breaker state
     */
    getCircuitBreakerState() {
        return this.circuitBreaker.getState();
    }

    /**
     * Generate unique request ID for tracking
     */
    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Check if an error is retryable (enhanced version)
     */
    private isRetryableError(error: any): boolean {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            // Network errors that might be temporary
            if (message.includes('network error') ||
                message.includes('connection refused') ||
                message.includes('timeout') ||
                message.includes('econnreset') ||
                message.includes('enotfound') ||
                message.includes('etimedout') ||
                message.includes('econnaborted')) {
                return true;
            }

            // HTTP status codes that might be temporary
            if (message.includes('http 500') ||
                message.includes('http 502') ||
                message.includes('http 503') ||
                message.includes('http 504') ||
                message.includes('http 429')) { // Rate limiting
                return true;
            }
        }

        return false;
    }

    /**
     * Sleep utility for delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
/**
 * Configuration interfaces for CampfireDevAgent
 * Based on requirement 4.1, 4.2, 4.3, 4.4
 */

export interface CampfireConfig {
  mcpServer: string;
  partyBoxPath: string;
  defaultPrompt: string;
  workspaceRoot?: string;
  osType?: 'windows' | 'linux' | 'macos';
  enableAutoCompletion: boolean;
  responseTimeout: number;
  retryAttempts: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  securityValidation: boolean;
  workspaceValidation: boolean;
  confirmFileOverwrites: boolean;
  maxFileSize: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ConfigurationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export const DEFAULT_CONFIG: CampfireConfig = {
  mcpServer: 'http://localhost:8080/mcp',
  partyBoxPath: './party_box',
  defaultPrompt: 'Build code for {task} on {os}',
  enableAutoCompletion: true,
  responseTimeout: 30000,
  retryAttempts: 3,
  logLevel: 'info',
  securityValidation: true,
  workspaceValidation: true,
  confirmFileOverwrites: true,
  maxFileSize: 1048576
};
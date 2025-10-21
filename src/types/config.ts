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
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const DEFAULT_CONFIG: CampfireConfig = {
  mcpServer: 'http://localhost:8080/mcp',
  partyBoxPath: './party_box',
  defaultPrompt: 'Build code for {task} on {os}'
};
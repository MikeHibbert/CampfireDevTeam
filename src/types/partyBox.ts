/**
 * Party Box data models and interfaces for CampfireValley communication
 * Based on requirements 11.1, 11.2, 11.4, 11.5, 11.6
 */

export interface Attachment {
  path: string;
  content: string;
  type: string;
  timestamp: string;
}

export interface Context {
  current_file?: string;
  project_structure: string[];
  terminal_history: string[];
}

export interface Torch {
  claim: 'generate_code' | 'review_code' | 'execute_command';
  task: string;
  os: 'windows' | 'linux' | 'macos';
  workspace_root: string;
  attachments: Attachment[];
  context: Context;
}

export interface PartyBox {
  torch: Torch;
  metadata?: Record<string, any>;
}

export interface CamperResponse {
  camper_role: string;
  response_type: 'code' | 'suggestion' | 'command' | 'error';
  content: string;
  files_to_create: Array<{ path: string; content: string }>;
  commands_to_execute: string[];
  confidence_score: number;
}

export interface BackendRequest {
  action: 'list_directory' | 'get_console' | 'get_code_section' | 'update_code';
  parameters: Record<string, any>;
  target_path?: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details: Record<string, any>;
    retry_possible: boolean;
  };
}
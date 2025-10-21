"use strict";
/**
 * Configuration interfaces for CampfireDevAgent
 * Based on requirement 4.1, 4.2, 4.3, 4.4
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
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
//# sourceMappingURL=config.js.map
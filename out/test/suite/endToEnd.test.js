"use strict";
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
const assert = __importStar(require("assert"));
const partyBoxManager_1 = require("../../managers/partyBoxManager");
const workspaceManager_1 = require("../../managers/workspaceManager");
const fileOperationsManager_1 = require("../../managers/fileOperationsManager");
const terminalManager_1 = require("../../managers/terminalManager");
const backendRequestHandler_1 = require("../../managers/backendRequestHandler");
const mcpClient_1 = require("../../handlers/mcpClient");
suite('End-to-End Workflow Tests', () => {
    let partyBoxManager;
    let workspaceManager;
    let fileOpsManager;
    let terminalManager;
    let requestHandler;
    let mcpClient;
    setup(() => {
        partyBoxManager = new partyBoxManager_1.PartyBoxManager();
        workspaceManager = new workspaceManager_1.WorkspaceManager();
        fileOpsManager = new fileOperationsManager_1.FileOperationsManager();
        terminalManager = new terminalManager_1.TerminalManager();
        requestHandler = new backendRequestHandler_1.BackendRequestHandler();
        mcpClient = new mcpClient_1.MCPClient();
    });
    test('Complete code generation workflow', async () => {
        // Simulate complete workflow from VS Code command to file creation
        const task = 'Create a Python hello world function';
        const workspaceRoot = '/test/workspace';
        const osType = terminalManager.detectOS();
        // 1. Create Party Box payload
        const payload = partyBoxManager.createPartyBoxPayload(task, osType, workspaceRoot, []);
        assert.ok(payload.torch);
        assert.strictEqual(payload.torch.task, task);
        // 2. Validate payload before sending
        const isValid = partyBoxManager.validatePayload(payload);
        assert.strictEqual(isValid, true);
        // 3. Mock MCP server response
        const mockResponse = {
            torch: {
                content: 'def hello():\n    print("Hello, World!")',
                files_to_create: [
                    {
                        path: 'hello.py',
                        content: 'def hello():\n    print("Hello, World!")'
                    }
                ],
                commands_to_execute: ['python hello.py']
            }
        };
        // 4. Parse response
        const parsed = partyBoxManager.parseResponse(mockResponse);
        assert.strictEqual(parsed.content, 'def hello():\n    print("Hello, World!")');
        assert.strictEqual(parsed.files_to_create.length, 1);
        // 5. Validate file creation safety
        const filePath = parsed.files_to_create[0].path;
        const fullPath = workspaceManager.resolveWorkspacePath(filePath, workspaceRoot);
        const isSafe = fileOpsManager.isFileCreationSafe(fullPath, workspaceRoot);
        assert.strictEqual(isSafe, true);
        // 6. Validate command safety
        const command = parsed.commands_to_execute[0];
        const isCommandSafe = terminalManager.isCommandSafe(command);
        assert.strictEqual(isCommandSafe, true);
    });
    test('Complete code review workflow', async () => {
        const task = 'Review this Python code for security issues';
        const workspaceRoot = '/test/workspace';
        const osType = terminalManager.detectOS();
        // Code to review
        const codeAttachment = {
            path: 'app.py',
            content: 'import os\npassword = "hardcoded_password"',
            type: 'text/python',
            timestamp: new Date()
        };
        // 1. Create Party Box payload with code attachment
        const payload = partyBoxManager.createPartyBoxPayload(task, osType, workspaceRoot, [codeAttachment]);
        assert.strictEqual(payload.torch.attachments.length, 1);
        assert.strictEqual(payload.torch.attachments[0].path, 'app.py');
        // 2. Mock review response
        const mockReviewResponse = {
            torch: {
                content: 'Security issues found: hardcoded password',
                suggestions: [
                    'Use environment variables for sensitive data',
                    'Implement proper secret management'
                ],
                security_score: 3
            }
        };
        // 3. Parse review response
        const parsed = partyBoxManager.parseResponse(mockReviewResponse);
        assert.ok(parsed.content.includes('Security issues'));
        assert.ok(parsed.suggestions);
        assert.strictEqual(parsed.suggestions.length, 2);
    });
    test('Backend request handling workflow', async () => {
        const workspaceRoot = '/test/workspace';
        // 1. Test directory listing request
        const dirRequest = {
            action: 'list_directory',
            parameters: { path: workspaceRoot },
            target_path: workspaceRoot
        };
        const isValidRequest = requestHandler.validateRequest(dirRequest, workspaceRoot);
        assert.strictEqual(isValidRequest, true);
        const dirResponse = requestHandler.handleDirectoryListing(dirRequest);
        assert.ok(dirResponse.files);
        assert.ok(Array.isArray(dirResponse.files));
        // 2. Test code section request
        const codeRequest = {
            action: 'get_code_section',
            parameters: {
                file_path: `${workspaceRoot}/src/test.py`,
                start_line: 1,
                end_line: 10
            },
            target_path: `${workspaceRoot}/src/test.py`
        };
        const isValidCodeRequest = requestHandler.validateRequest(codeRequest, workspaceRoot);
        assert.strictEqual(isValidCodeRequest, true);
        const codeResponse = requestHandler.handleCodeSectionRequest(codeRequest);
        assert.ok(codeResponse.hasOwnProperty('content'));
        // 3. Test confirmation response
        const confirmation = requestHandler.createConfirmationResponse('list_directory', true, { files_count: 5 });
        assert.strictEqual(confirmation.action, 'list_directory');
        assert.strictEqual(confirmation.success, true);
        assert.ok(confirmation.timestamp);
    });
    test('Error handling workflow', async () => {
        const workspaceRoot = '/test/workspace';
        // 1. Test invalid Party Box payload
        const invalidPayload = {
            invalid: 'structure'
        };
        const isValid = partyBoxManager.validatePayload(invalidPayload);
        assert.strictEqual(isValid, false);
        // 2. Test unsafe file path
        const unsafePath = '/etc/passwd';
        const isSafe = fileOpsManager.isFileCreationSafe(unsafePath, workspaceRoot);
        assert.strictEqual(isSafe, false);
        // 3. Test unsafe command
        const unsafeCommand = 'rm -rf /';
        const isCommandSafe = terminalManager.isCommandSafe(unsafeCommand);
        assert.strictEqual(isCommandSafe, false);
        // 4. Test invalid backend request
        const invalidRequest = {
            action: 'list_directory',
            parameters: { path: '/etc' },
            target_path: '/etc'
        };
        const isValidRequest = requestHandler.validateRequest(invalidRequest, workspaceRoot);
        assert.strictEqual(isValidRequest, false);
    });
    test('Workspace change handling workflow', async () => {
        const initialWorkspace = '/initial/workspace';
        const newWorkspace = '/new/workspace';
        // 1. Set initial workspace
        workspaceManager.updateWorkspaceConfiguration(initialWorkspace);
        assert.strictEqual(workspaceManager.getCurrentWorkspaceRoot(), initialWorkspace);
        // 2. Test workspace change detection
        let changeDetected = false;
        workspaceManager.onWorkspaceChange(() => {
            changeDetected = true;
        });
        // 3. Change workspace
        workspaceManager.updateWorkspaceConfiguration(newWorkspace);
        assert.strictEqual(workspaceManager.getCurrentWorkspaceRoot(), newWorkspace);
        assert.strictEqual(changeDetected, true);
        // 4. Validate file paths in new workspace
        const testPath = `${newWorkspace}/src/test.py`;
        const isWithinWorkspace = workspaceManager.isPathWithinWorkspace(testPath, newWorkspace);
        assert.strictEqual(isWithinWorkspace, true);
    });
    test('Performance requirements workflow', async () => {
        // Test 1-second response requirement simulation
        const startTime = Date.now();
        // Simulate lightweight operations that should complete quickly
        const task = 'Simple code generation task';
        const workspaceRoot = '/test/workspace';
        const osType = terminalManager.detectOS();
        // 1. Create payload (should be fast)
        const payload = partyBoxManager.createPartyBoxPayload(task, osType, workspaceRoot, []);
        // 2. Validate payload (should be fast)
        const isValid = partyBoxManager.validatePayload(payload);
        // 3. Mock quick response processing
        const mockResponse = {
            torch: {
                content: 'print("Hello")',
                files_to_create: [],
                commands_to_execute: []
            }
        };
        const parsed = partyBoxManager.parseResponse(mockResponse);
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        // Local processing should be very fast (under 100ms)
        assert.ok(processingTime < 100, `Processing took ${processingTime}ms, should be under 100ms`);
        assert.strictEqual(isValid, true);
        assert.ok(parsed.content);
    });
});
//# sourceMappingURL=endToEnd.test.js.map
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
suite('PartyBoxManager Test Suite', () => {
    let partyBoxManager;
    setup(() => {
        partyBoxManager = new partyBoxManager_1.PartyBoxManager();
    });
    test('Should create valid Party Box payload', () => {
        const task = 'Create a hello world function';
        const osType = 'windows';
        const workspaceRoot = '/test/workspace';
        const attachments = [{
                path: 'test.py',
                content: 'print("hello")',
                type: 'text/python',
                timestamp: new Date()
            }];
        const payload = partyBoxManager.createPartyBoxPayload(task, osType, workspaceRoot, attachments);
        assert.strictEqual(payload.torch.task, task);
        assert.strictEqual(payload.torch.os, osType);
        assert.strictEqual(payload.torch.workspace_root, workspaceRoot);
        assert.strictEqual(payload.torch.attachments.length, 1);
        assert.strictEqual(payload.torch.attachments[0].path, 'test.py');
    });
    test('Should validate Party Box payload structure', () => {
        const validPayload = {
            torch: {
                claim: 'generate_code',
                task: 'test task',
                os: 'windows',
                workspace_root: '/test',
                attachments: [],
                context: {
                    current_file: 'test.py',
                    project_structure: ['test.py'],
                    terminal_history: []
                }
            }
        };
        const isValid = partyBoxManager.validatePayload(validPayload);
        assert.strictEqual(isValid, true);
    });
    test('Should reject invalid Party Box payload', () => {
        const invalidPayload = {
            torch: {
                // Missing required fields
                task: 'test task'
            }
        };
        const isValid = partyBoxManager.validatePayload(invalidPayload);
        assert.strictEqual(isValid, false);
    });
    test('Should parse response Party Box correctly', () => {
        const responsePayload = {
            torch: {
                claim: 'code_response',
                content: 'def hello(): print("Hello World")',
                files_to_create: [
                    { path: 'hello.py', content: 'def hello(): print("Hello World")' }
                ],
                commands_to_execute: ['python hello.py']
            }
        };
        const parsed = partyBoxManager.parseResponse(responsePayload);
        assert.strictEqual(parsed.content, 'def hello(): print("Hello World")');
        assert.strictEqual(parsed.files_to_create.length, 1);
        assert.strictEqual(parsed.commands_to_execute.length, 1);
    });
});
//# sourceMappingURL=partyBoxManager.test.js.map
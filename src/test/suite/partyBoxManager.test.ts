import * as assert from 'assert';
import * as vscode from 'vscode';
import { PartyBoxManager } from '../../managers/partyBoxManager';

suite('PartyBoxManager Test Suite', () => {
    let partyBoxManager: PartyBoxManager;

    setup(() => {
        partyBoxManager = new PartyBoxManager();
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

        const payload = partyBoxManager.createPartyBoxPayload(
            task,
            osType,
            workspaceRoot,
            attachments
        );

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
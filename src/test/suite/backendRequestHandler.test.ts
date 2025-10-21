import * as assert from 'assert';
import * as vscode from 'vscode';
import { BackendRequestHandler } from '../../managers/backendRequestHandler';

suite('BackendRequestHandler Test Suite', () => {
    let requestHandler: BackendRequestHandler;

    setup(() => {
        requestHandler = new BackendRequestHandler();
    });

    test('Should validate backend requests for security', () => {
        const validRequest = {
            action: 'list_directory',
            parameters: { path: '/workspace/src' },
            target_path: '/workspace/src'
        };

        const invalidRequest = {
            action: 'list_directory',
            parameters: { path: '/etc/passwd' },
            target_path: '/etc/passwd'
        };

        const isValid = requestHandler.validateRequest(validRequest, '/workspace');
        const isInvalid = requestHandler.validateRequest(invalidRequest, '/workspace');

        assert.strictEqual(isValid, true);
        assert.strictEqual(isInvalid, false);
    });

    test('Should handle directory listing requests', () => {
        const request = {
            action: 'list_directory',
            parameters: { path: '/workspace/src' },
            target_path: '/workspace/src'
        };

        const response = requestHandler.handleDirectoryListing(request);
        
        assert.ok(response.files);
        assert.ok(Array.isArray(response.files));
    });

    test('Should handle code section requests', () => {
        const request = {
            action: 'get_code_section',
            parameters: { 
                file_path: '/workspace/src/test.py',
                start_line: 1,
                end_line: 10
            },
            target_path: '/workspace/src/test.py'
        };

        const response = requestHandler.handleCodeSectionRequest(request);
        
        assert.ok(response.hasOwnProperty('content'));
        assert.ok(response.hasOwnProperty('line_count'));
    });

    test('Should handle code update requests', () => {
        const request = {
            action: 'update_code',
            parameters: {
                file_path: '/workspace/src/test.py',
                content: 'def hello(): print("Hello World")',
                operation: 'replace'
            },
            target_path: '/workspace/src/test.py'
        };

        const response = requestHandler.handleCodeUpdate(request);
        
        assert.strictEqual(response.success, true);
        assert.ok(response.message);
    });

    test('Should provide confirmation responses', () => {
        const action = 'update_code';
        const success = true;
        const details = { files_modified: 1 };

        const confirmation = requestHandler.createConfirmationResponse(action, success, details);
        
        assert.strictEqual(confirmation.action, action);
        assert.strictEqual(confirmation.success, success);
        assert.deepStrictEqual(confirmation.details, details);
        assert.ok(confirmation.timestamp);
    });
});
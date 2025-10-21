import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceManager } from '../../managers/workspaceManager';

suite('WorkspaceManager Test Suite', () => {
    let workspaceManager: WorkspaceManager;

    setup(() => {
        workspaceManager = new WorkspaceManager();
    });

    test('Should detect workspace root folder', () => {
        // Mock workspace folder
        const mockWorkspaceFolder = {
            uri: vscode.Uri.file('/test/workspace'),
            name: 'test-workspace',
            index: 0
        };

        const workspaceRoot = workspaceManager.getWorkspaceRoot(mockWorkspaceFolder);
        assert.strictEqual(workspaceRoot, '/test/workspace');
    });

    test('Should validate file paths within workspace boundary', () => {
        const workspaceRoot = '/test/workspace';
        const validPath = '/test/workspace/src/file.py';
        const invalidPath = '/other/directory/file.py';

        const isValidPath = workspaceManager.isPathWithinWorkspace(validPath, workspaceRoot);
        const isInvalidPath = workspaceManager.isPathWithinWorkspace(invalidPath, workspaceRoot);

        assert.strictEqual(isValidPath, true);
        assert.strictEqual(isInvalidPath, false);
    });

    test('Should handle workspace configuration updates', () => {
        const newWorkspaceRoot = '/new/workspace';
        
        workspaceManager.updateWorkspaceConfiguration(newWorkspaceRoot);
        const currentRoot = workspaceManager.getCurrentWorkspaceRoot();
        
        assert.strictEqual(currentRoot, newWorkspaceRoot);
    });

    test('Should detect workspace changes', () => {
        let changeDetected = false;
        
        workspaceManager.onWorkspaceChange(() => {
            changeDetected = true;
        });

        // Simulate workspace change
        workspaceManager.updateWorkspaceConfiguration('/changed/workspace');
        
        assert.strictEqual(changeDetected, true);
    });
});
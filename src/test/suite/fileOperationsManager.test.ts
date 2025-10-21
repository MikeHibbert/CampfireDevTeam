import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { FileOperationsManager } from '../../managers/fileOperationsManager';

suite('FileOperationsManager Test Suite', () => {
    let fileOpsManager: FileOperationsManager;

    setup(() => {
        fileOpsManager = new FileOperationsManager();
    });

    test('Should determine appropriate file location based on type', () => {
        const workspaceRoot = '/test/workspace';
        
        const pythonLocation = fileOpsManager.getFileLocation('test.py', workspaceRoot);
        const jsLocation = fileOpsManager.getFileLocation('test.js', workspaceRoot);
        const htmlLocation = fileOpsManager.getFileLocation('index.html', workspaceRoot);

        assert.ok(pythonLocation.includes(workspaceRoot));
        assert.ok(jsLocation.includes(workspaceRoot));
        assert.ok(htmlLocation.includes(workspaceRoot));
    });

    test('Should validate file creation safety', () => {
        const workspaceRoot = '/test/workspace';
        const safePath = path.join(workspaceRoot, 'src', 'test.py');
        const unsafePath = '/other/directory/test.py';

        const isSafe = fileOpsManager.isFileCreationSafe(safePath, workspaceRoot);
        const isUnsafe = fileOpsManager.isFileCreationSafe(unsafePath, workspaceRoot);

        assert.strictEqual(isSafe, true);
        assert.strictEqual(isUnsafe, false);
    });

    test('Should handle different file types correctly', () => {
        const supportedTypes = ['.py', '.js', '.ts', '.html', '.css', '.json', '.md'];
        
        supportedTypes.forEach(ext => {
            const isSupported = fileOpsManager.isSupportedFileType(`test${ext}`);
            assert.strictEqual(isSupported, true, `${ext} should be supported`);
        });

        const unsupportedType = fileOpsManager.isSupportedFileType('test.xyz');
        assert.strictEqual(unsupportedType, false);
    });

    test('Should generate appropriate directory structure', () => {
        const workspaceRoot = '/test/workspace';
        
        const pythonDir = fileOpsManager.getDirectoryForFileType('.py', workspaceRoot);
        const jsDir = fileOpsManager.getDirectoryForFileType('.js', workspaceRoot);
        const configDir = fileOpsManager.getDirectoryForFileType('.json', workspaceRoot);

        assert.ok(pythonDir.includes('src') || pythonDir === workspaceRoot);
        assert.ok(jsDir.includes('src') || jsDir === workspaceRoot);
        assert.ok(configDir === workspaceRoot || configDir.includes('config'));
    });
});
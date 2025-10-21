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
const path = __importStar(require("path"));
const fileOperationsManager_1 = require("../../managers/fileOperationsManager");
suite('FileOperationsManager Test Suite', () => {
    let fileOpsManager;
    setup(() => {
        fileOpsManager = new fileOperationsManager_1.FileOperationsManager();
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
//# sourceMappingURL=fileOperationsManager.test.js.map
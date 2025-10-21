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
const vscode = __importStar(require("vscode"));
const workspaceManager_1 = require("../../managers/workspaceManager");
suite('WorkspaceManager Test Suite', () => {
    let workspaceManager;
    setup(() => {
        workspaceManager = new workspaceManager_1.WorkspaceManager();
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
//# sourceMappingURL=workspaceManager.test.js.map
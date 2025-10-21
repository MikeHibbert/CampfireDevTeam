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
const terminalManager_1 = require("../../managers/terminalManager");
suite('TerminalManager Test Suite', () => {
    let terminalManager;
    setup(() => {
        terminalManager = new terminalManager_1.TerminalManager();
    });
    test('Should detect operating system correctly', () => {
        const osType = terminalManager.detectOS();
        // Should return one of the supported OS types
        const supportedOS = ['windows', 'linux', 'macos'];
        assert.ok(supportedOS.includes(osType));
    });
    test('Should format commands for Windows PowerShell', () => {
        const command = 'ls -la';
        const windowsCommand = terminalManager.formatCommandForOS(command, 'windows');
        // Should convert to PowerShell equivalent
        assert.ok(windowsCommand.includes('Get-ChildItem') || windowsCommand.includes('dir'));
    });
    test('Should format commands for Linux/macOS', () => {
        const command = 'dir';
        const linuxCommand = terminalManager.formatCommandForOS(command, 'linux');
        const macCommand = terminalManager.formatCommandForOS(command, 'macos');
        // Should convert to bash equivalent
        assert.ok(linuxCommand.includes('ls') || linuxCommand === command);
        assert.ok(macCommand.includes('ls') || macCommand === command);
    });
    test('Should validate command safety', () => {
        const safeCommands = ['ls', 'dir', 'python --version', 'npm install'];
        const unsafeCommands = ['rm -rf /', 'del /f /s /q C:\\', 'format C:'];
        safeCommands.forEach(cmd => {
            const isSafe = terminalManager.isCommandSafe(cmd);
            assert.strictEqual(isSafe, true, `${cmd} should be safe`);
        });
        unsafeCommands.forEach(cmd => {
            const isSafe = terminalManager.isCommandSafe(cmd);
            assert.strictEqual(isSafe, false, `${cmd} should be unsafe`);
        });
    });
    test('Should handle command execution results', () => {
        const mockOutput = 'Command executed successfully';
        const mockError = 'Command failed with error';
        const successResult = terminalManager.processCommandResult(mockOutput, null);
        const errorResult = terminalManager.processCommandResult(null, mockError);
        assert.strictEqual(successResult.success, true);
        assert.strictEqual(successResult.output, mockOutput);
        assert.strictEqual(errorResult.success, false);
        assert.strictEqual(errorResult.error, mockError);
    });
});
//# sourceMappingURL=terminalManager.test.js.map
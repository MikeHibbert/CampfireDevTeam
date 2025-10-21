import * as assert from 'assert';
import * as vscode from 'vscode';
import { TerminalManager } from '../../managers/terminalManager';

suite('TerminalManager Test Suite', () => {
    let terminalManager: TerminalManager;

    setup(() => {
        terminalManager = new TerminalManager();
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
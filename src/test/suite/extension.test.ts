// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import * as vscode from 'vscode';

// Test the extension functionality
suite('Extension Integration Tests', () => {
    test('Extension should be present and activate', async () => {
        const extension = vscode.extensions.getExtension('ms-promptu.promptu');
        assert.ok(extension, 'Extension should be found');
        
        if (!extension.isActive) {
            await extension.activate();
        }
        
        assert.ok(extension.isActive, 'Extension should be active');
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        
        const expectedCommands = [
            'promptu.executePrompt',
            'promptu.setCopilotChatCommand',
            'promptu.discoverChatCommands',
            'promptu.listMcpPrompts'
        ];
        
        for (const expectedCommand of expectedCommands) {
            assert.ok(
                commands.includes(expectedCommand),
                `Command ${expectedCommand} should be registered`
            );
        }
    });

    suite('Workspace Selection Integration', () => {
        test('should handle workspace selection cancellation', async () => {
            // This test would require complex mocking of VS Code APIs
            // For now, we just verify the command exists and is callable
            const commands = await vscode.commands.getCommands();
            assert.ok(commands.includes('promptu.executePrompt'));
        });
    });

    test('Configuration should have default values', () => {
        const config = vscode.workspace.getConfiguration('promptu');
        const chatCommand = config.get<string>('copilotChatCommand');
        
        assert.strictEqual(typeof chatCommand, 'string', 'Chat command should be a string');
        assert.ok(chatCommand && chatCommand.length > 0, 'Chat command should not be empty');
    });
});
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { CopilotExecutor } from '../../copilotExecutor';

suite('CopilotExecutor Test Suite', () => {
    let executor: CopilotExecutor;
    let mockOutputChannel: vscode.OutputChannel;

    setup(() => {
        // Create a mock output channel for testing
        mockOutputChannel = {
            appendLine: () => {},
            dispose: () => {},
            name: 'test',
            clear: () => {},
            hide: () => {},
            show: () => {},
            append: () => {},
            replace: () => {}
        } as vscode.OutputChannel;
        
        executor = new CopilotExecutor(mockOutputChannel);
    });

    suite('CopilotExecutor Creation', () => {
        test('should create CopilotExecutor instance', () => {
            assert.ok(executor instanceof CopilotExecutor, 'Should create a CopilotExecutor instance');
        });

        test('should have executePrompt method', () => {
            assert.strictEqual(typeof executor.executePrompt, 'function', 'Should have executePrompt method');
        });

        test('should have setCopilotChatCommand method', () => {
            assert.strictEqual(typeof executor.setCopilotChatCommand, 'function', 'Should have setCopilotChatCommand method');
        });

        test('should have discoverChatCommands method', () => {
            assert.strictEqual(typeof executor.discoverChatCommands, 'function', 'Should have discoverChatCommands method');
        });
    });

    // Note: More comprehensive testing would require mocking VS Code APIs
    // For now, we test basic functionality without actual command execution
    suite('Configuration', () => {
        test('should read configuration on creation', () => {
            const config = vscode.workspace.getConfiguration('promptu');
            const chatCommand = config.get<string>('copilotChatCommand');
            assert.ok(chatCommand, 'Should have a default chat command configured');
        });
    });
});
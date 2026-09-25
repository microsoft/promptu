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

        test('should force Local chat by default', () => {
            const config = vscode.workspace.getConfiguration('promptu');
            assert.strictEqual(config.get<boolean>('forceLocalChat'), true, 'promptu.forceLocalChat should default to true');
        });
    });

    suite('New Chat Session', () => {
        const newLocalChatCommand = 'workbench.action.chat.newLocalChat';
        const newChatCommand = 'workbench.action.chat.newChat';

        let originalExecuteCommand: typeof vscode.commands.executeCommand;
        let executedCommands: string[];
        let chatCommand: string | undefined;

        /**
         * Replaces vscode.commands.executeCommand with a stub that records the command IDs
         * @param failingCommands - Command IDs that throw, as if VS Code does not provide them
         */
        function stubExecuteCommand(failingCommands: string[] = []): void {
            (vscode.commands as any).executeCommand = async (command: string) => {
                executedCommands.push(command);
                if (failingCommands.includes(command)) {
                    throw new Error(`command '${command}' not found`);
                }
                return undefined;
            };
        }

        setup(() => {
            originalExecuteCommand = vscode.commands.executeCommand;
            executedCommands = [];
            chatCommand = vscode.workspace.getConfiguration('promptu').get<string>('copilotChatCommand');
        });

        teardown(async () => {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            await vscode.workspace.getConfiguration('promptu').update('forceLocalChat', undefined, vscode.ConfigurationTarget.Global);
        });

        test('should open a new Local chat before sending the prompt', async () => {
            stubExecuteCommand();
            await executor.executeCopilotChatCommand('/test-prompt');
            assert.deepStrictEqual(executedCommands, [newLocalChatCommand, chatCommand]);
        });

        test('should open a regular new chat when a new Local chat is not available', async () => {
            stubExecuteCommand([newLocalChatCommand]);
            await executor.executeCopilotChatCommand('/test-prompt');
            assert.deepStrictEqual(executedCommands, [newLocalChatCommand, newChatCommand, chatCommand]);
        });

        test('should open a regular new chat when forceLocalChat is false', async () => {
            await vscode.workspace.getConfiguration('promptu').update('forceLocalChat', false, vscode.ConfigurationTarget.Global);
            stubExecuteCommand();
            await executor.executeCopilotChatCommand('/test-prompt');
            assert.deepStrictEqual(executedCommands, [newChatCommand, chatCommand]);
        });

        test('should send the prompt when no new chat can be opened', async () => {
            stubExecuteCommand([newLocalChatCommand, newChatCommand]);
            await executor.executeCopilotChatCommand('/test-prompt');
            assert.deepStrictEqual(executedCommands, [newLocalChatCommand, newChatCommand, chatCommand]);
        });

        test('should find the new chat commands in VS Code', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes(newLocalChatCommand), `VS Code should provide '${newLocalChatCommand}'`);
            assert.ok(commands.includes(newChatCommand), `VS Code should provide '${newChatCommand}'`);
        });
    });
});
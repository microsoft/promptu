// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureMcpServersStarted } from '../../mcpStartup';

suite('McpStartup Test Suite', () => {
    let mockOutputChannel: vscode.OutputChannel;
    let logLines: string[];
    let originalExecuteCommand: typeof vscode.commands.executeCommand;

    setup(() => {
        logLines = [];
        mockOutputChannel = {
            appendLine: (line: string) => { logLines.push(line); },
            dispose: () => {},
            name: 'test',
            clear: () => {},
            hide: () => {},
            show: () => {},
            append: () => {},
            replace: () => {}
        } as vscode.OutputChannel;

        originalExecuteCommand = vscode.commands.executeCommand;
    });

    teardown(() => {
        (vscode.commands as any).executeCommand = originalExecuteCommand;
    });

    test('should call startServer with correct ID and options', async () => {
        const calls: { id: string; opts: any }[] = [];
        (vscode.commands as any).executeCommand = async (command: string, ...args: any[]) => {
            if (command === 'workbench.mcp.startServer') {
                calls.push({ id: args[0], opts: args[1] });
                return;
            }
            return originalExecuteCommand(command, ...args);
        };

        await ensureMcpServersStarted(
            [{ name: 'MyServer', type: 'http', url: 'http://test.com' }],
            mockOutputChannel
        );

        assert.ok(calls.length >= 1);
        assert.strictEqual(calls[0].id, 'mcp.config.usrlocal.MyServer');
        assert.deepStrictEqual(calls[0].opts, { waitForLiveTools: true });
    });

    test('should retry 4 times', async () => {
        let callCount = 0;
        (vscode.commands as any).executeCommand = async (command: string, ...args: any[]) => {
            if (command === 'workbench.mcp.startServer') {
                callCount++;
                return;
            }
            return originalExecuteCommand(command, ...args);
        };

        await ensureMcpServersStarted(
            [{ name: 'TestServer', type: 'http', url: 'http://test.com' }],
            mockOutputChannel
        );

        assert.strictEqual(callCount, 4);
    });

    test('should start multiple servers sequentially within each attempt', async () => {
        const order: string[] = [];
        (vscode.commands as any).executeCommand = async (command: string, ...args: any[]) => {
            if (command === 'workbench.mcp.startServer') {
                const id = args[0] as string;
                order.push(`start:${id}`);
                await new Promise(r => setTimeout(r, 10));
                order.push(`done:${id}`);
                return;
            }
            return originalExecuteCommand(command, ...args);
        };

        await ensureMcpServersStarted(
            [
                { name: 'A', type: 'http' as const, url: 'http://a.com' },
                { name: 'B', type: 'http' as const, url: 'http://b.com' }
            ],
            mockOutputChannel
        );

        // Within each attempt, A completes before B starts
        const firstA = order.indexOf('start:mcp.config.usrlocal.A');
        const firstADone = order.indexOf('done:mcp.config.usrlocal.A');
        const firstB = order.indexOf('start:mcp.config.usrlocal.B');
        assert.ok(firstA < firstADone);
        assert.ok(firstADone < firstB);
    });

    test('should handle startServer errors gracefully', async () => {
        let callCount = 0;
        (vscode.commands as any).executeCommand = async (command: string, ...args: any[]) => {
            if (command === 'workbench.mcp.startServer') {
                callCount++;
                if (callCount === 1) {
                    throw new Error('command failed');
                }
                return;
            }
            return originalExecuteCommand(command, ...args);
        };

        // Should not throw
        await ensureMcpServersStarted(
            [{ name: 'TestServer', type: 'http', url: 'http://test.com' }],
            mockOutputChannel
        );

        assert.ok(logLines.some(l => l.includes('startServer error')));
        assert.strictEqual(callCount, 4);
    });

    test('should handle empty server array', async () => {
        await ensureMcpServersStarted([], mockOutputChannel);
        assert.strictEqual(logLines.length, 0);
    });
});

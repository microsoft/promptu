// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { McpInstaller } from '../../mcpInstaller';

suite('McpInstaller Test Suite', () => {
    let mcpInstaller: McpInstaller;
    let mockOutputChannel: vscode.OutputChannel;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
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

        mockContext = {
            globalStorageUri: vscode.Uri.file('/test/globalStorage')
        } as vscode.ExtensionContext;
        
        mcpInstaller = new McpInstaller(mockOutputChannel, mockContext);
    });

    suite('parseMcpParameter', () => {
        test('should parse single server object', () => {
            const param = JSON.stringify({ name: 'TestServer', type: 'http', url: 'http://test.com' });
            const result = McpInstaller.parseMcpParameter(param);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'TestServer');
            assert.strictEqual(result[0].type, 'http');
            assert.strictEqual(result[0].url, 'http://test.com');
        });

        test('should parse array of servers', () => {
            const servers = [
                { name: 'Server1', type: 'http', url: 'http://test1.com' },
                { name: 'Server2', type: 'stdio', command: 'test-cmd' }
            ];
            const param = JSON.stringify(servers);
            const result = McpInstaller.parseMcpParameter(param);
            
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'Server1');
            assert.strictEqual(result[1].name, 'Server2');
        });

        test('should handle URL encoded parameters', () => {
            const serverObj = { name: 'TestServer', type: 'http', url: 'http://test.com' };
            const param = encodeURIComponent(JSON.stringify(serverObj));
            const result = McpInstaller.parseMcpParameter(param);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'TestServer');
        });

        test('should throw error for invalid JSON', () => {
            assert.throws(() => {
                McpInstaller.parseMcpParameter('invalid json');
            }, /MCP parameter must be valid JSON/);
        });

        test('should throw error for non-object, non-array JSON', () => {
            assert.throws(() => {
                McpInstaller.parseMcpParameter('"just a string"');
            }, /MCP parameter must be valid JSON/);
        });
    });

    suite('Version Comparison', () => {
        test('should handle standard semantic versions', () => {
            const installer = mcpInstaller as any; // Access private method
            
            assert.strictEqual(installer.isVersionSufficient('1.2.3', '1.2.3'), true);
            assert.strictEqual(installer.isVersionSufficient('1.2.4', '1.2.3'), true);
            assert.strictEqual(installer.isVersionSufficient('1.2.2', '1.2.3'), false);
            assert.strictEqual(installer.isVersionSufficient('2.0.0', '1.9.9'), true);
        });

        test('should handle date-based versions', () => {
            const installer = mcpInstaller as any;
            
            assert.strictEqual(installer.isVersionSufficient('2025.1.15', '2025.1.14'), true);
            assert.strictEqual(installer.isVersionSufficient('2025.1.13', '2025.1.14'), false);
        });

        test('should handle 4-part versions', () => {
            const installer = mcpInstaller as any;
            
            assert.strictEqual(installer.isVersionSufficient('1.2.3.4', '1.2.3.3'), true);
            assert.strictEqual(installer.isVersionSufficient('1.2.3.2', '1.2.3.3'), false);
        });

        test('should handle pre-release versions', () => {
            const installer = mcpInstaller as any;
            
            // Release version satisfies pre-release requirement
            assert.strictEqual(installer.isVersionSufficient('1.0.0', '1.0.0-alpha'), true);
            // Pre-release doesn't satisfy release requirement
            assert.strictEqual(installer.isVersionSufficient('1.0.0-alpha', '1.0.0'), false);
        });

        test('should handle versions with different part counts', () => {
            const installer = mcpInstaller as any;
            
            assert.strictEqual(installer.isVersionSufficient('1.2', '1.2.0'), true);
            assert.strictEqual(installer.isVersionSufficient('1.2.0', '1.2'), true);
        });
    });
});
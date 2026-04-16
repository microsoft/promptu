// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { McpInstaller, parseDotnetToolListOutput } from '../../mcpInstaller';

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
            const result = mcpInstaller.parseMcpParameter(param);
            
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
            const result = mcpInstaller.parseMcpParameter(param);
            
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'Server1');
            assert.strictEqual(result[1].name, 'Server2');
        });

        test('should handle URL encoded parameters', () => {
            const serverObj = { name: 'TestServer', type: 'http', url: 'http://test.com' };
            const param = encodeURIComponent(JSON.stringify(serverObj));
            const result = mcpInstaller.parseMcpParameter(param);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'TestServer');
        });

        test('should handle double URL encoded parameters (SafeLinks scenario)', () => {
            const serverObj = { name: 'TestServer', type: 'http', url: 'https://test.com/mcp' };
            // Double encode to simulate SafeLinks/redirect adding extra encoding
            const param = encodeURIComponent(encodeURIComponent(JSON.stringify(serverObj)));
            const result = mcpInstaller.parseMcpParameter(param);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'TestServer');
            assert.strictEqual(result[0].url, 'https://test.com/mcp');
        });

        test('should handle triple URL encoded parameters', () => {
            const serverObj = { name: 'TestServer', type: 'http', url: 'https://test.com/mcp' };
            // Triple encode to simulate multiple redirects
            const param = encodeURIComponent(encodeURIComponent(encodeURIComponent(JSON.stringify(serverObj))));
            const result = mcpInstaller.parseMcpParameter(param);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'TestServer');
        });

        test('should handle already valid JSON (no encoding)', () => {
            const param = '{"name":"TestServer","type":"http","url":"https://test.com"}';
            const result = mcpInstaller.parseMcpParameter(param);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'TestServer');
        });

        test('should throw error for invalid JSON', () => {
            assert.throws(() => {
                mcpInstaller.parseMcpParameter('invalid json');
            }, /mcp parameter: must be valid JSON/);
        });

        test('should throw error for non-object, non-array JSON', () => {
            assert.throws(() => {
                mcpInstaller.parseMcpParameter('"just a string"');
            }, /mcp parameter: must be an object or array/);
        });

        test('should throw error for missing name field', () => {
            assert.throws(() => {
                mcpInstaller.parseMcpParameter('{"type":"http","url":"https://example.com"}');
            }, /mcp parameter: server missing required "name" field/);
        });

        test('should throw error for missing type field', () => {
            assert.throws(() => {
                mcpInstaller.parseMcpParameter('{"name":"TestServer","url":"https://example.com"}');
            }, /mcp parameter: server .* has invalid "type"/);
        });

        test('should throw error for invalid type value', () => {
            assert.throws(() => {
                mcpInstaller.parseMcpParameter('{"name":"TestServer","type":"websocket"}');
            }, /mcp parameter: server .* has invalid "type"/);
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

    suite('parseDotnetToolListOutput', () => {
        test('should parse standard dotnet tool list output', () => {
            const stdout = [
                'Package Id          Version          Commands',
                '---------------------------------------------------',
                'my-example-tool     1.2.3            MyExampleTool'
            ].join('\n');
            const result = parseDotnetToolListOutput(stdout);
            assert.deepStrictEqual(result, { version: '1.2.3', commandName: 'MyExampleTool' });
        });

        test('should return null when package is not installed', () => {
            const stdout = [
                'Package Id          Version          Commands',
                '---------------------------------------------------'
            ].join('\n');
            const result = parseDotnetToolListOutput(stdout);
            assert.strictEqual(result, null);
        });

        test('should return null for empty string', () => {
            assert.strictEqual(parseDotnetToolListOutput(''), null);
        });

        test('should return null when data row has fewer than 3 columns', () => {
            const stdout = [
                'Package Id          Version          Commands',
                '---------------------------------------------------',
                'my-example-tool     1.2.3'
            ].join('\n');
            const result = parseDotnetToolListOutput(stdout);
            assert.strictEqual(result, null);
        });

        test('should handle pre-release versions', () => {
            const stdout = [
                'Package Id          Version          Commands',
                '---------------------------------------------------',
                'mypackage           1.2.3-beta       MyTool'
            ].join('\n');
            const result = parseDotnetToolListOutput(stdout);
            assert.deepStrictEqual(result, { version: '1.2.3-beta', commandName: 'MyTool' });
        });

        test('should handle extra whitespace in columns', () => {
            const stdout = [
                'Package Id                                    Version          Commands',
                '-----------------------------------------------------------------------------------',
                '  my-example-tool                              2.0.1            MyExampleTool  '
            ].join('\n');
            const result = parseDotnetToolListOutput(stdout);
            assert.deepStrictEqual(result, { version: '2.0.1', commandName: 'MyExampleTool' });
        });
    });
});
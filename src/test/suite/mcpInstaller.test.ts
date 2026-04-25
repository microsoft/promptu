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

        const stateStore: Record<string, any> = {};
        mockContext = {
            globalStorageUri: vscode.Uri.file('/test/globalStorage'),
            globalState: {
                get: (key: string, defaultValue?: any) => stateStore[key] ?? defaultValue,
                update: async (key: string, value: any) => { stateStore[key] = value; },
                keys: () => Object.keys(stateStore),
                setKeysForSync: () => {}
            }
        } as unknown as vscode.ExtensionContext;
        
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

    suite('hasConfigChanged', () => {
        test('should return false when configs match', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http', url: 'https://example.com/mcp' };
            const server = { name: 'test', type: 'http', url: 'https://example.com/mcp' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), false);
        });

        test('should return true when URL differs', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http', url: 'https://old-url.com/mcp' };
            const server = { name: 'test', type: 'http', url: 'https://new-url.com/mcp' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), true);
        });

        test('should return true when type differs', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http', url: 'https://example.com/mcp' };
            const server = { name: 'test', type: 'stdio', command: 'my-tool' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), true);
        });

        test('should return false when key order differs but values match', () => {
            const installer = mcpInstaller as any;
            const existing = { url: 'https://example.com/mcp', type: 'http' };
            const server = { name: 'test', type: 'http', url: 'https://example.com/mcp' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), false);
        });

        test('should return false when falsy fields normalize to same result', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http', url: 'https://example.com/mcp', command: '' };
            const server = { name: 'test', type: 'http', url: 'https://example.com/mcp' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), false);
        });

        test('should return true when command differs', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'stdio', command: 'old-tool' };
            const server = { name: 'test', type: 'stdio', command: 'new-tool' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), true);
        });

        test('should return true when args differ', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'stdio', command: 'tool', args: ['--old'] };
            const server = { name: 'test', type: 'stdio', command: 'tool', args: ['--new'] };
            assert.strictEqual(installer.hasConfigChanged(existing, server), true);
        });

        test('should return false when both have no optional fields', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http' };
            const server = { name: 'test', type: 'http' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), false);
        });

        test('should return false when env keys are in different order but values match', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http', url: 'https://example.com/mcp', env: { B: '2', A: '1' } };
            const server = { name: 'test', type: 'http', url: 'https://example.com/mcp', env: { A: '1', B: '2' } };
            assert.strictEqual(installer.hasConfigChanged(existing, server), false);
        });

        test('should return false when empty env vs no env', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http', url: 'https://example.com/mcp', env: {} };
            const server = { name: 'test', type: 'http', url: 'https://example.com/mcp' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), false);
        });

        test('should return false when empty args vs no args', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'stdio', command: 'tool', args: [] };
            const server = { name: 'test', type: 'stdio', command: 'tool' };
            assert.strictEqual(installer.hasConfigChanged(existing, server), false);
        });

        test('should return true when env values differ', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http', url: 'https://example.com/mcp', env: { KEY: 'old' } };
            const server = { name: 'test', type: 'http', url: 'https://example.com/mcp', env: { KEY: 'new' } };
            assert.strictEqual(installer.hasConfigChanged(existing, server), true);
        });

        test('should return false when env value is number vs equivalent string', () => {
            const installer = mcpInstaller as any;
            const existing = { type: 'http', url: 'https://example.com/mcp', env: { PORT: 8080 } };
            const server = { name: 'test', type: 'http', url: 'https://example.com/mcp', env: { PORT: '8080' } };
            assert.strictEqual(installer.hasConfigChanged(existing, server), false);
        });
    });

    suite('Update Suppression', () => {
        test('should not be suppressed when no suppression stored', () => {
            const installer = mcpInstaller as any;
            const server = { name: 'test-server', type: 'http', url: 'https://example.com/mcp' };
            assert.strictEqual(installer.isUpdateSuppressed(server), false);
        });

        test('should be suppressed after storing suppression for same config', async () => {
            const installer = mcpInstaller as any;
            const server = { name: 'test-server', type: 'http', url: 'https://example.com/mcp' };
            await installer.suppressUpdate(server);
            assert.strictEqual(installer.isUpdateSuppressed(server), true);
        });

        test('should not be suppressed when incoming config differs from suppressed config', async () => {
            const installer = mcpInstaller as any;
            const server1 = { name: 'test-server', type: 'http', url: 'https://old-url.com/mcp' };
            await installer.suppressUpdate(server1);

            const server2 = { name: 'test-server', type: 'http', url: 'https://new-url.com/mcp' };
            assert.strictEqual(installer.isUpdateSuppressed(server2), false);
        });

        test('should clear suppression for a server', async () => {
            const installer = mcpInstaller as any;
            const server = { name: 'test-server', type: 'http', url: 'https://example.com/mcp' };
            await installer.suppressUpdate(server);
            assert.strictEqual(installer.isUpdateSuppressed(server), true);

            await installer.clearUpdateSuppression('test-server');
            assert.strictEqual(installer.isUpdateSuppressed(server), false);
        });

        test('should not affect other servers when clearing suppression', async () => {
            const installer = mcpInstaller as any;
            const server1 = { name: 'server-a', type: 'http', url: 'https://a.com/mcp' };
            const server2 = { name: 'server-b', type: 'http', url: 'https://b.com/mcp' };
            await installer.suppressUpdate(server1);
            await installer.suppressUpdate(server2);

            await installer.clearUpdateSuppression('server-a');
            assert.strictEqual(installer.isUpdateSuppressed(server1), false);
            assert.strictEqual(installer.isUpdateSuppressed(server2), true);
        });

        test('should suppress based on incoming config only, not existing config', async () => {
            const installer = mcpInstaller as any;
            const server = { name: 'test-server', type: 'http', url: 'https://new-url.com/mcp' };
            await installer.suppressUpdate(server);

            // Same incoming config should still be suppressed regardless of what the existing config is
            assert.strictEqual(installer.isUpdateSuppressed(server), true);
        });

        test('should handle clearing non-existent suppression gracefully', async () => {
            const installer = mcpInstaller as any;
            // Should not throw
            await installer.clearUpdateSuppression('non-existent-server');
        });
    });
});
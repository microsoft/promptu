// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import { parsePrompt, getPromptName, addDefaultExtension, parseWorkspaceParameter } from '../../promptParser';

suite('promptParser Test Suite', () => {
    suite('parsePrompt', () => {
        test('should parse GitHub shorthand correctly', () => {
            const result = parsePrompt('gh:owner/repo/path/to/prompt');
            assert.strictEqual(result.type, 'github');
            assert.strictEqual(result.name, 'prompt');
            assert.strictEqual(result.owner, 'owner');
            assert.strictEqual(result.repo, 'repo');
            assert.strictEqual(result.filePath, 'path/to/prompt.prompt.md');
        });

        test('should parse ADO shorthand correctly', () => {
            const result = parsePrompt('ado:org/project/repo/path/to/prompt');
            assert.strictEqual(result.type, 'ado');
            assert.strictEqual(result.name, 'prompt');
            assert.strictEqual(result.org, 'org');
            assert.strictEqual(result.project, 'project');
            assert.strictEqual(result.repo, 'repo');
            assert.strictEqual(result.filePath, 'path/to/prompt.prompt.md');
        });

        test('should parse GitHub shorthand with existing extension', () => {
            const result = parsePrompt('gh:owner/repo/path/prompt.md');
            assert.strictEqual(result.type, 'github');
            assert.strictEqual(result.name, 'prompt');
            assert.strictEqual(result.filePath, 'path/prompt.md');
        });

        test('should parse HTTP URLs correctly', () => {
            const result = parsePrompt('https://example.com/path/to/prompt.md');
            assert.strictEqual(result.type, 'url');
            assert.strictEqual(result.name, 'prompt');
            assert.strictEqual(result.url, 'https://example.com/path/to/prompt.md');
        });

        test('should parse HTTP URLs and add extension when missing', () => {
            const result = parsePrompt('https://example.com/path/to/prompt');
            assert.strictEqual(result.type, 'url');
            assert.strictEqual(result.name, 'prompt');
            assert.strictEqual(result.url, 'https://example.com/path/to/prompt.prompt.md');
        });

        test('should parse Windows absolute paths', () => {
            const result = parsePrompt('C:\\\\Users\\\\user\\\\prompts\\\\code-review.md');
            assert.strictEqual(result.type, 'local');
            assert.strictEqual(result.name, 'code-review');
            assert.strictEqual(result.localPath, 'C:\\\\Users\\\\user\\\\prompts\\\\code-review.md');
        });

        test('should parse Unix absolute paths', () => {
            const result = parsePrompt('/home/user/prompts/debug-helper');
            assert.strictEqual(result.type, 'local');
            assert.strictEqual(result.name, 'debug-helper');
            assert.strictEqual(result.localPath, '/home/user/prompts/debug-helper.prompt.md');
        });

        test('should parse prompt names (default case)', () => {
            const result = parsePrompt('code-review');
            assert.strictEqual(result.type, 'installed');
            assert.strictEqual(result.name, 'code-review');
        });

        test('should parse prompt names with dashes and underscores', () => {
            const result = parsePrompt('debug_helper-v2');
            assert.strictEqual(result.type, 'installed');
            assert.strictEqual(result.name, 'debug_helper-v2');
        });

        test('should parse MCP prompts correctly', () => {
            const result = parsePrompt('mcp.myserver.myprompt');
            assert.strictEqual(result.type, 'mcp');
            assert.strictEqual(result.name, 'mcp.myserver.myprompt');
        });

        test('should throw error for invalid MCP format', () => {
            assert.throws(() => {
                parsePrompt('mcp.serveronly');
            }, /Invalid MCP prompt format/);
        });

        test('should throw error for MCP with too many parts', () => {
            assert.throws(() => {
                parsePrompt('mcp.server.prompt.extra');
            }, /Invalid MCP prompt format/);
        });

        test('should throw error for invalid ADO format', () => {
            assert.throws(() => {
                parsePrompt('ado:org/project');
            }, /Invalid ADO format/);
        });

        test('should throw error for invalid GitHub format', () => {
            assert.throws(() => {
                parsePrompt('gh:owner');
            }, /Invalid GitHub format/);
        });

        test('should throw error for empty platform path', () => {
            assert.throws(() => {
                parsePrompt('ado:');
            }, /Invalid ADO format|Invalid format/);
        });

        test('should throw error for unsupported platform', () => {
            assert.throws(() => {
                parsePrompt('bitbucket:owner/repo/path');
            }, /Unsupported platform: bitbucket/);
        });

        test('should handle paths with colons correctly', () => {
            const result = parsePrompt('ado:org/project/repo/path:with:colons/file');
            assert.strictEqual(result.type, 'ado');
            assert.strictEqual(result.filePath, 'path:with:colons/file.prompt.md');
        });
    });

    suite('getPromptName', () => {
        test('should extract name from GitHub path', () => {
            const result = getPromptName('gh:owner/repo/path/to/my-prompt.md');
            assert.strictEqual(result, 'my-prompt');
        });

        test('should extract name from ADO path', () => {
            const result = getPromptName('ado:org/project/repo/folder/debug-helper.prompt.md');
            assert.strictEqual(result, 'debug-helper');
        });

        test('should extract name from URL', () => {
            const result = getPromptName('https://example.com/prompts/code-review.txt');
            assert.strictEqual(result, 'code-review');
        });

        test('should extract name from Windows path', () => {
            const result = getPromptName('C:\\\\prompts\\\\analysis.json');
            assert.strictEqual(result, 'analysis');
        });

        test('should extract name from Unix path', () => {
            const result = getPromptName('/home/user/prompts/test-helper.md');
            assert.strictEqual(result, 'test-helper');
        });

        test('should handle simple prompt names', () => {
            const result = getPromptName('simple-prompt');
            assert.strictEqual(result, 'simple-prompt');
        });

        test('should handle paths with multiple extensions', () => {
            const result = getPromptName('path/to/file.prompt.md');
            assert.strictEqual(result, 'file');
        });

        test('should handle files without extensions', () => {
            const result = getPromptName('path/to/filename');
            assert.strictEqual(result, 'filename');
        });

        test('should handle .prompt.md compound extension correctly', () => {
            const result = getPromptName('/home/user/my-prompt.prompt.md');
            assert.strictEqual(result, 'my-prompt');
        });
    });

    suite('addDefaultExtension', () => {
        test('should add default extension when missing', () => {
            const result = addDefaultExtension('path/to/prompt');
            assert.strictEqual(result, 'path/to/prompt.prompt.md');
        });

        test('should not add extension when .prompt.md already exists', () => {
            const result = addDefaultExtension('path/to/prompt.prompt.md');
            assert.strictEqual(result, 'path/to/prompt.prompt.md');
        });

        test('should not add extension when .md exists', () => {
            const result = addDefaultExtension('path/to/prompt.md');
            assert.strictEqual(result, 'path/to/prompt.md');
        });

        test('should not add extension when .txt exists', () => {
            const result = addDefaultExtension('path/to/prompt.txt');
            assert.strictEqual(result, 'path/to/prompt.txt');
        });

        test('should not add extension when .json exists', () => {
            const result = addDefaultExtension('path/to/prompt.json');
            assert.strictEqual(result, 'path/to/prompt.json');
        });

        test('should add extension for unrecognized extensions', () => {
            const result = addDefaultExtension('path/to/prompt.xyz');
            assert.strictEqual(result, 'path/to/prompt.xyz.prompt.md');
        });

        test('should handle empty path', () => {
            const result = addDefaultExtension('');
            assert.strictEqual(result, '.prompt.md');
        });

        test('should handle path with only extension', () => {
            const result = addDefaultExtension('.md');
            assert.strictEqual(result, '.md');
        });
    });

    suite('parseWorkspaceParameter', () => {
        test('should return current for empty parameter', () => {
            const result = parseWorkspaceParameter('');
            assert.strictEqual(result.type, 'current');
        });

        test('should throw error for "current" parameter (not a valid explicit option)', () => {
            assert.throws(() => {
                parseWorkspaceParameter('current');
            }, /Invalid workspace type: current/);
        });

        test('should return select for select parameter', () => {
            const result = parseWorkspaceParameter('select');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, undefined);
        });

        test('should parse select with message', () => {
            const result = parseWorkspaceParameter('select:This prompt works best in React projects');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, 'This prompt works best in React projects');
        });

        test('should handle URL-encoded messages', () => {
            const result = parseWorkspaceParameter('select:This%20prompt%20works%20best');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, 'This prompt works best');
        });

        test('should handle messages with colons', () => {
            const result = parseWorkspaceParameter('select:Note: This is important');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, 'Note: This is important');
        });

        test('should throw error for invalid workspace type', () => {
            assert.throws(() => {
                parseWorkspaceParameter('invalid');
            }, /Invalid workspace type: invalid. Use 'select'/);
        });

        test('should throw error for invalid workspace type with message', () => {
            assert.throws(() => {
                parseWorkspaceParameter('invalid:some message');
            }, /Invalid workspace type: invalid:some message. Use 'select' or 'select:message'/);
        });
    });
});
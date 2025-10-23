// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import { parseWorkspaceParameter } from '../../promptParser';

suite('WorkspaceSelector Test Suite', () => {
    suite('parseWorkspaceParameter', () => {
        test('should parse empty workspace parameter as current', () => {
            const result = parseWorkspaceParameter('');
            assert.strictEqual(result.type, 'current');
            assert.strictEqual(result.message, undefined);
        });

        test('should parse "select" as select type with no message', () => {
            const result = parseWorkspaceParameter('select');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, undefined);
        });

        test('should parse "select:message" format correctly', () => {
            const result = parseWorkspaceParameter('select:This prompt works best in React projects');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, 'This prompt works best in React projects');
        });

        test('should handle URL encoded messages', () => {
            const result = parseWorkspaceParameter('select:This%20prompt%20works%20best%20in%20React%20projects');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, 'This prompt works best in React projects');
        });

        test('should throw error for "current" type (not a valid explicit option)', () => {
            assert.throws(() => {
                parseWorkspaceParameter('current');
            }, /Invalid workspace type: current/);
        });

        test('should throw error for unknown types', () => {
            assert.throws(() => {
                parseWorkspaceParameter('unknown:message');
            }, /Invalid workspace type: unknown/);
        });

        test('should handle messages with multiple colons', () => {
            const result = parseWorkspaceParameter('select:Message with: colons: in it');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, 'Message with: colons: in it');
        });

        test('should handle empty message after colon', () => {
            const result = parseWorkspaceParameter('select:');
            assert.strictEqual(result.type, 'select');
            assert.strictEqual(result.message, '');
        });
    });
});
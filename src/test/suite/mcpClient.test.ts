// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import { parseWWWAuthenticateBearer } from '../../mcpClient';

suite('McpClient Test Suite', () => {
    suite('parseWWWAuthenticateBearer', () => {
        test('should return empty object for null header', () => {
            const result = parseWWWAuthenticateBearer(null);
            assert.deepStrictEqual(result, {});
        });

        test('should return empty object for empty string', () => {
            const result = parseWWWAuthenticateBearer('');
            assert.deepStrictEqual(result, {});
        });

        test('should return empty object for non-Bearer scheme', () => {
            const result = parseWWWAuthenticateBearer('Basic realm="test"');
            assert.deepStrictEqual(result, {});
        });

        test('should extract scope from standard Bearer challenge', () => {
            const result = parseWWWAuthenticateBearer('Bearer scope="api://myapp/.default"');
            assert.strictEqual(result.scope, 'api://myapp/.default');
            assert.strictEqual(result.resourceMetadata, undefined);
            assert.strictEqual(result.error, undefined);
        });

        test('should extract resource_metadata from Bearer challenge', () => {
            const result = parseWWWAuthenticateBearer('Bearer resource_metadata="https://server.com/.well-known/oauth-protected-resource"');
            assert.strictEqual(result.resourceMetadata, 'https://server.com/.well-known/oauth-protected-resource');
            assert.strictEqual(result.scope, undefined);
        });

        test('should extract error from Bearer challenge', () => {
            const result = parseWWWAuthenticateBearer('Bearer error="insufficient_scope"');
            assert.strictEqual(result.error, 'insufficient_scope');
        });

        test('should extract all three params when present', () => {
            const result = parseWWWAuthenticateBearer(
                'Bearer scope="api://myapp/users", resource_metadata="https://server.com/.well-known/oauth-protected-resource", error="invalid_token"'
            );
            assert.strictEqual(result.scope, 'api://myapp/users');
            assert.strictEqual(result.resourceMetadata, 'https://server.com/.well-known/oauth-protected-resource');
            assert.strictEqual(result.error, 'invalid_token');
        });

        test('should be case-insensitive for Bearer scheme', () => {
            const result = parseWWWAuthenticateBearer('bearer scope="test-scope"');
            assert.strictEqual(result.scope, 'test-scope');
        });

        test('should handle Bearer with no params', () => {
            const result = parseWWWAuthenticateBearer('Bearer');
            assert.deepStrictEqual(result, {});
        });

        test('should handle multiple schemes and extract only Bearer params', () => {
            const result = parseWWWAuthenticateBearer('Bearer scope="api://myapp/.default", Basic realm="fallback"');
            assert.strictEqual(result.scope, 'api://myapp/.default');
        });

        test('should not match scope as substring of another word (word boundary)', () => {
            const result = parseWWWAuthenticateBearer('Bearer noscope="fake", scope="real"');
            assert.strictEqual(result.scope, 'real');
        });

        test('should handle multiple space-separated scopes', () => {
            const result = parseWWWAuthenticateBearer('Bearer scope="openid profile email"');
            assert.strictEqual(result.scope, 'openid profile email');
        });

        test('should handle real-world Entra ID challenge', () => {
            const result = parseWWWAuthenticateBearer(
                'Bearer resource_metadata="https://example.com/api/.well-known/oauth-protected-resource"'
            );
            assert.strictEqual(result.resourceMetadata, 'https://example.com/api/.well-known/oauth-protected-resource');
        });
    });
});

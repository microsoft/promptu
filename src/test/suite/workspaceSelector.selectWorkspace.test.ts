// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceSelector } from '../../workspaceSelector';

suite('WorkspaceSelector.selectWorkspace Test Suite', () => {
    let workspaceSelector: WorkspaceSelector;
    let mockOutputChannel: vscode.OutputChannel;

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
        
        workspaceSelector = new WorkspaceSelector(mockOutputChannel);
    });

    suite('Return Type Contract', () => {
        test('should return null when user cancels quick pick', async () => {
            // Mock showQuickPick to return undefined (user cancelled)
            const originalShowQuickPick = vscode.window.showQuickPick;
            (vscode.window as any).showQuickPick = async () => undefined;

            try {
                const result = await workspaceSelector.selectWorkspace({ type: 'select' });
                assert.strictEqual(result, null, 'Should return null when user cancels');
            } finally {
                vscode.window.showQuickPick = originalShowQuickPick;
            }
        });

        test('should return undefined when user chooses "no workspace" option', async () => {
            // Mock showQuickPick to return the "none" action
            const originalShowQuickPick = vscode.window.showQuickPick;
            (vscode.window as any).showQuickPick = async () => ({ action: 'none' } as any);

            try {
                const result = await workspaceSelector.selectWorkspace({ type: 'select' });
                assert.strictEqual(result, undefined, 'Should return undefined for no workspace');
            } finally {
                vscode.window.showQuickPick = originalShowQuickPick;
            }
        });

        test('should return workspace path when user selects current workspace', async () => {
            // Mock workspace folders by mocking the getter
            const originalGetWorkspaceFolders = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
            const testPath = process.platform === 'win32' ? '\\test\\path' : '/test/path';
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                get: () => [{
                    name: 'test-workspace',
                    uri: vscode.Uri.file(testPath),
                    index: 0
                }],
                configurable: true
            });

            // Mock showQuickPick to return the "current" action
            const originalShowQuickPick = vscode.window.showQuickPick;
            (vscode.window as any).showQuickPick = async () => ({ action: 'current' } as any);

            try {
                const result = await workspaceSelector.selectWorkspace({ type: 'select' });
                assert.strictEqual(result, testPath, 'Should return current workspace path');
            } finally {
                vscode.window.showQuickPick = originalShowQuickPick;
                if (originalGetWorkspaceFolders) {
                    Object.defineProperty(vscode.workspace, 'workspaceFolders', originalGetWorkspaceFolders);
                }
            }
        });

        test('should return null when user cancels folder selection', async () => {
            // Mock showQuickPick to return the "select" action
            const originalShowQuickPick = vscode.window.showQuickPick;
            (vscode.window as any).showQuickPick = async () => ({ action: 'select' } as any);

            // Mock showOpenDialog to return undefined (user cancelled)
            const originalShowOpenDialog = vscode.window.showOpenDialog;
            (vscode.window as any).showOpenDialog = async () => undefined;

            try {
                const result = await workspaceSelector.selectWorkspace({ type: 'select' });
                assert.strictEqual(result, null, 'Should return null when folder selection is cancelled');
            } finally {
                vscode.window.showQuickPick = originalShowQuickPick;
                vscode.window.showOpenDialog = originalShowOpenDialog;
            }
        });
    });
});
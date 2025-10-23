// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { WorkspaceConfig } from './types';

/**
 * Handles workspace selection for prompt execution
 */
export class WorkspaceSelector {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Shows workspace selection dialog and returns the selected workspace path
     * @param config - Workspace configuration with optional custom message
     * @returns Promise that resolves to:
     *   - string: selected workspace path (open new window)
     *   - undefined: execute without workspace context (continue execution)
     *   - null: user cancelled (stop execution)
     */
    public async selectWorkspace(config: WorkspaceConfig): Promise<string | null | undefined> {
        // Get current workspace info for display
        const currentWorkspace = this.getCurrentWorkspaceInfo();
        
        // Build dialog message
        let message = 'Select workspace for this prompt:';
        if (config.message) {
            message = config.message;
        }
        message = `promptu: ${message}`;

        // Define workspace action types
        type WorkspaceAction = 'current' | 'select' | 'none';
        
        // Create quick pick options with action metadata
        const options: (vscode.QuickPickItem & { action: WorkspaceAction })[] = [];
        
        if (currentWorkspace.path) {
            // If workspace is open: option to use current or select different
            options.push({
                label: '$(folder-opened) Use Current Workspace',
                description: currentWorkspace.name,
                detail: currentWorkspace.path,
                alwaysShow: true,
                action: 'current'
            });

            options.push({
                label: '$(folder) Select Different Workspace...',
                description: 'Choose a different workspace folder',
                alwaysShow: true,
                action: 'select'
            });
        } else {
            // If no workspace is open: option to select one or execute without
            options.push({
                label: '$(folder) Select Workspace...',
                description: 'Choose a workspace folder',
                alwaysShow: true,
                action: 'select'
            });

            options.push({
                label: '$(x) Execute without workspace context',
                description: 'Run prompt without specific workspace',
                alwaysShow: true,
                action: 'none'
            });
        }

        // Show the selection dialog
        const selected = await vscode.window.showQuickPick(options, {
            title: 'Workspace Selection',
            placeHolder: message,
            ignoreFocusOut: true
        });

        if (!selected) {
            return null; // User cancelled
        }

        // Handle user's choice based on action property
        switch (selected.action) {
            case 'current':
                return currentWorkspace.path;
                
            case 'none':
                return undefined; // No workspace context
                
            case 'select':
                // Show folder picker
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: 'Select Workspace Folder'
                });

                if (folderUri && folderUri.length > 0) {
                    return folderUri[0].fsPath;
                }
                return null; // User cancelled folder selection
                
            default:
                return undefined;
        }
    }

    /**
     * Opens a workspace in a new window and re-executes the original promptu URI
     * @param workspacePath - Path to the workspace folder to open
     * @param originalPrompt - Original prompt parameter
     * @param originalInput - Original input parameter
     * @param originalMcp - Original MCP parameter
     * @returns Promise that resolves when workspace is opened and URI is re-executed
     */
    public async openWorkspaceAndExecute(
        workspacePath: string,
        originalPrompt: string,
        originalInput: string | null,
        originalMcp: string | null
    ): Promise<void> {
        try {
            this.outputChannel.appendLine(`promptu: Opening workspace: ${workspacePath}`);
            
            // Open new window with selected workspace
            const workspaceUri = vscode.Uri.file(workspacePath);
            await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, {
                forceNewWindow: true
            });

            // Reconstruct and re-execute original URI (excluding workspace parameter to avoid dialog loop)
            let newUri = `vscode://ms-promptu.promptu?prompt=${encodeURIComponent(originalPrompt)}`;
            
            if (originalInput) {
                newUri += `&input=${encodeURIComponent(originalInput)}`;
            }
            
            if (originalMcp) {
                newUri += `&mcp=${encodeURIComponent(originalMcp)}`;
            }

            this.outputChannel.appendLine(`promptu: Re-executing URI in new workspace: ${newUri}`);
            
            // Send URI to the new window (should route to the newly opened window)
            await vscode.env.openExternal(vscode.Uri.parse(newUri));
            
        } catch (error) {
            const message = `Failed to open workspace: ${error instanceof Error ? error.message : 'Unknown error'}`;
            vscode.window.showErrorMessage(`promptu: ${message}`);
            throw new Error(message);
        }
    }

    /**
     * Gets information about the current workspace
     * @returns Object with current workspace name and path
     */
    private getCurrentWorkspaceInfo(): { name: string; path: string | undefined } {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return { name: 'No workspace open', path: undefined };
        }
        
        if (workspaceFolders.length === 1) {
            const folder = workspaceFolders[0];
            return {
                name: folder.name,
                path: folder.uri.fsPath
            };
        }
        
        // Multi-root workspace
        return {
            name: `Multi-root workspace (${workspaceFolders.length} folders)`,
            path: workspaceFolders[0].uri.fsPath // Use first folder as representative path
        };
    }
}
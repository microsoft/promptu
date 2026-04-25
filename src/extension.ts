// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { PromptFetcher } from './promptFetcher';
import { CopilotExecutor } from './copilotExecutor';
import { parsePrompt, parseWorkspaceParameter } from './promptParser';
import { McpInstaller } from './mcpInstaller';
import { McpClient } from './mcpClient';
import { WorkspaceSelector } from './workspaceSelector';
import { showPromptConfirmation } from './userDialogs';
import { McpServerConfig } from './types';

// Create a global output channel for the extension
const outputChannel = vscode.window.createOutputChannel('promptu');

/**
 * Activates the Promptu VS Code extension
 * @param context - The extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext) {
    outputChannel.appendLine('promptu: extension is now active!');

    const promptFetcher = new PromptFetcher(outputChannel);
    const copilotExecutor = new CopilotExecutor(outputChannel);
    const mcpInstaller = new McpInstaller(outputChannel, context);
    const mcpClient = new McpClient(outputChannel);
    const workspaceSelector = new WorkspaceSelector(outputChannel);


    // Register URI handler
    context.subscriptions.push(
        vscode.window.registerUriHandler({
            handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
                // Parse URI parameters
                const query = new URLSearchParams(uri.query);
                const prompt = query.get('prompt');
                const input = query.get('input');
                const mcp = query.get('mcp');
                const workspace = query.get('workspace');

                if (!prompt) {
                    vscode.window.showErrorMessage('Missing prompt parameter in URI');
                    return;
                }

                return executePromptLogic(prompt, input || '', mcp, workspace, promptFetcher, copilotExecutor, mcpInstaller, mcpClient, workspaceSelector, context);
            }
        })
    );

    // Add executePrompt command that can be called manually
    context.subscriptions.push(
        vscode.commands.registerCommand('promptu.executePrompt', async (promptuUri?: string) => {
            // If called without parameters, get URI from user input
            if (!promptuUri) {
                promptuUri = await vscode.window.showInputBox({
                    prompt: 'Enter promptu URI',
                    placeHolder: 'e.g., vscode://ms-promptu.promptu?prompt=gh:user/repo/prompt&mcp=server1',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'URI cannot be empty';
                        }
                        if (!value.includes('?prompt=')) {
                            return 'URI must contain a prompt parameter';
                        }
                        return null;
                    }
                });
                
                if (!promptuUri) {
                    return; // User cancelled
                }
            }
                
            try {
                // Parse the vscode:// URI to extract query parameters
                const uri = vscode.Uri.parse(promptuUri);
                const queryString = uri.query;
                
                // Parse query parameters
                const query = new URLSearchParams(queryString);
                const prompt = query.get('prompt');
                const input = query.get('input');
                const mcp = query.get('mcp');

                if (!prompt) {
                    throw new Error('Missing prompt parameter in URI');
                }

                // Execute using existing logic
                await executePromptLogic(prompt, input || '', mcp, null, promptFetcher, copilotExecutor, mcpInstaller, mcpClient, workspaceSelector, context);
                
            } catch (error) {
                const message = `Failed to execute promptu URI: ${error instanceof Error ? error.message : 'Unknown error'}`;
                vscode.window.showErrorMessage(message);
            }
        })
    );

    // Add command to set Copilot Chat command
    context.subscriptions.push(
        vscode.commands.registerCommand('promptu.setCopilotChatCommand', async () => {
            await copilotExecutor.setCopilotChatCommand();
        })
    );

    // Add command to discover available chat commands
    context.subscriptions.push(
        vscode.commands.registerCommand('promptu.discoverChatCommands', async () => {
            await copilotExecutor.discoverChatCommands();
        })
    );

    // Add command to list MCP server prompts (debugging)
    context.subscriptions.push(
        vscode.commands.registerCommand('promptu.listMcpPrompts', async () => {
            const serverName = await vscode.window.showInputBox({
                prompt: 'Enter MCP server name to list prompts',
                placeHolder: 'e.g., TestLogAnalyzer',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Server name cannot be empty';
                    }
                    return null;
                }
            });
            
            if (!serverName) {
                return; // User cancelled
            }

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Listing prompts from ${serverName}...`,
                    cancellable: false
                }, async () => {
                    // For debugging, load servers from configuration
                    const mcpServers = await mcpInstaller.getMcpServers();
                    
                    // Find the specific server configuration
                    const serverConfig = mcpServers.find(server => server.name === serverName);
                    if (!serverConfig) {
                        throw new Error(`MCP server '${serverName}' not found in configuration`);
                    }
                    
                    const prompts = await mcpClient.listPrompts(serverConfig);
                    
                    if (prompts.length === 0) {
                        vscode.window.showInformationMessage(`No prompts found on MCP server '${serverName}'`);
                    } else {
                        vscode.window.showInformationMessage(
                            `Found ${prompts.length} prompt(s) on '${serverName}': ${prompts.join(', ')}`
                        );
                    }
                });
            } catch (error) {
                const message = `Failed to list prompts: ${error instanceof Error ? error.message : 'Unknown error'}`;
                vscode.window.showErrorMessage(message);
            }
        })
    );
}

/**
 * Executes the core prompt fetching and execution logic
 * @param prompt - The prompt identifier (platform shorthand, URL, or local path)
 * @param input - The input data to pass to the prompt (optional)
 * @param mcp - MCP server configuration (optional)
 * @param workspace - Workspace parameter for workspace selection (optional)
 * @param promptFetcher - Instance of PromptFetcher for fetching prompts
 * @param copilotExecutor - Instance of CopilotExecutor for executing prompts
 * @param mcpInstaller - Instance of McpInstaller for handling MCP servers
 * @param mcpClient - Instance of McpClient for MCP communication
 * @param workspaceSelector - Instance of WorkspaceSelector for workspace handling
 * @param context - The VS Code extension context
 * @returns Promise that resolves when the prompt execution is complete
 * @throws {Error} When prompt fetching or execution fails
 */
async function executePromptLogic(
    prompt: string,
    input: string,
    mcp: string | null,
    workspace: string | null,
    promptFetcher: PromptFetcher,
    copilotExecutor: CopilotExecutor,
    mcpInstaller: McpInstaller,
    mcpClient: McpClient,
    workspaceSelector: WorkspaceSelector,
    context: vscode.ExtensionContext
): Promise<void> {
    try {
        // Parse prompt to understand its type
        const parsedPrompt = parsePrompt(prompt);
        
        // Parse MCP servers if specified (moved up for confirmation dialog)
        let mcpServers: McpServerConfig[] = [];
        if (mcp) {
            try {
                mcpServers = mcpInstaller.parseMcpParameter(mcp);
            } catch (error) {
                throw new Error(`MCP parameter parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        
        // Show confirmation dialog
        const confirmed = await showPromptConfirmation(parsedPrompt, input, mcpServers);
        if (!confirmed) {
            return; // User cancelled
        }

        // Handle workspace selection if specified
        if (workspace) {
            const workspaceConfig = parseWorkspaceParameter(workspace);
            if (workspaceConfig.type === 'select') {
                const selectedWorkspacePath = await workspaceSelector.selectWorkspace(workspaceConfig);
                if (selectedWorkspacePath === null) {
                    return; // User cancelled workspace selection
                } else if (selectedWorkspacePath) {
                    // User selected a specific workspace path - open new window and re-execute
                    await workspaceSelector.openWorkspaceAndExecute(selectedWorkspacePath, prompt, input, mcp);
                    return;
                }
            }
        }

        // Show loading message with progress indicator
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "promptu",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Processing prompt..." });
            
            // Handle MCP servers if specified
            if (mcpServers.length > 0) {
                progress.report({ message: "Setting up MCP servers..." });
                try {
                    const serversReady = await mcpInstaller.installServers(mcpServers);
                    if (!serversReady) {
                        // User cancelled MCP installation - just return without error
                        outputChannel.appendLine('promptu: MCP installation cancelled by user');
                        return;
                    }
                } catch (error) {
                    throw new Error(`MCP setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            
            // Handle different prompt types
            switch (parsedPrompt.type) {
                case 'mcp':
                    progress.report({ message: "Fetching MCP prompt..." });
                    
                    // Get the prompt content from the MCP server
                    const promptContent = await mcpClient.getPrompt(parsedPrompt.name, input, mcpServers);
                    
                    // Execute the fetched prompt content with Copilot
                    progress.report({ message: "Executing prompt..." });
                    await copilotExecutor.executeCopilotChatCommand(promptContent);
                    break;

                case 'installed':
                    // Installed prompts don't need fetching, execute directly
                    progress.report({ message: "Executing prompt..." });
                    await copilotExecutor.executePrompt(parsedPrompt.name, input);
                    break;

                default:
                    // All other prompt types (file-based) need to be fetched first
                    progress.report({ message: "Fetching prompt..." });
                    const slashName = await promptFetcher.fetchPrompt(parsedPrompt, context);
                    
                    // Then execute with Copilot using the resolved slash command name
                    progress.report({ message: "Executing prompt..." });
                    await copilotExecutor.executePrompt(slashName, input);
                    break;
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`promptu: Error executing prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Deactivates the Promptu extension
 * @description
 * Called when the extension is deactivated. Disposes of the output channel
 * and performs other cleanup as needed.
 */
export function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
}

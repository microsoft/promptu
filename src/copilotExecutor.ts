// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';

/**
 * Executes prompts with GitHub Copilot Chat
 * @description
 * Provides functionality to process prompt content with user input
 * and execute the resulting prompt in VS Code's Copilot Chat interface.
 * Includes fallback mechanisms to handle API changes across VS Code versions.
 */
export class CopilotExecutor {

    private static readonly defaultCommandVariants = [
        'workbench.action.chat.openagent',  // Current command
        'workbench.action.chat.openAgent',  // Previous command
        'workbench.action.chat.open',  // default chat command
    ];

    private chatCommand: string;
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        // Get the chat command from VS Code settings (will use package.json default if not configured)
        const config = vscode.workspace.getConfiguration('promptu');
        this.chatCommand = config.get('copilotChatCommand', CopilotExecutor.defaultCommandVariants[0]);
    }
    
    /**
     * Executes a prompt with input data in Copilot Chat
     * @param promptName - The name of the prompt to execute as a slash command
     * @param promptInput - The input data to pass with the prompt
     * @returns Promise that resolves when the prompt is sent to Copilot Chat
     * @throws {Error} When prompt execution fails
     */
    public async executePrompt(promptName: string, promptInput: string): Promise<void> {
        try {
            // Use the slash command approach directly
            const slashCommand = promptInput ? `/${promptName} ${promptInput}` : `/${promptName}`;
            await this.executeCopilotChatCommand(slashCommand);
        } catch (error) {
            throw new Error(`Failed to execute prompt '${promptName}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Sends text content directly to Copilot Chat
     * @param content - The text content to send to Copilot Chat
     * @returns Promise that resolves when the content is sent to Copilot Chat
     * @throws {Error} When content sending fails
     */
    public async executeCopilotChatCommand(content: string): Promise<void> {
        // Try to open a new chat first, before attempting any commands
        try {
            await vscode.commands.executeCommand('workbench.action.chat.newChat');
        } catch (newChatError) {
            // If new chat command fails, continue anyway
            this.outputChannel.appendLine('promptu: Could not open new chat: ' + newChatError);
            console.warn('promptu: Could not open new chat:', newChatError);
        }

        let lastError: Error | undefined;

        // Run the chat command
        try {
            await vscode.commands.executeCommand(this.chatCommand, content);
            this.outputChannel.appendLine(`promptu: Content sent to Copilot Chat`);
            return;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }

        // FALLBACK: If the default command fails, try other variants
        for (const command of CopilotExecutor.defaultCommandVariants) {
            try {
                // Skip if we already tried this command
                if (command === this.chatCommand) {
                    continue;
                }

                // Try to execute the command
                await vscode.commands.executeCommand(command, content);
                
                // Cache successful command
                await this.updateChatCommandSetting(command);
                this.outputChannel.appendLine(`promptu: Content sent to Copilot Chat`);
                return; // Success - exit early
                
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // Continue to next command variant
                continue;
            }
        }

        // If we get here, all commands failed
        const triedCommands = [this.chatCommand, ...CopilotExecutor.defaultCommandVariants.filter((cmd: string) => cmd !== this.chatCommand)];
        throw new Error(`Failed to execute Copilot Chat command. Available commands may have changed. Make sure GitHub Copilot Chat is installed and enabled. 
            Tried variants: ${triedCommands.join(', ')}. You can also run 'promptu: Discover Chat Commands' from the Command Palette to change the chat command used. 
            Last error: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * Helper function to update the chat command setting
     * @param newCommand - The new command to set
     * @returns Promise that resolves when the setting is updated
     */
    private async updateChatCommandSetting(newCommand: string): Promise<void> {
        // Update the in-memory chat command
        this.chatCommand = newCommand;

        // Save to settings
        const config = vscode.workspace.getConfiguration('promptu');
        try {
            await config.update('copilotChatCommand', newCommand, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`promptu: Chat command set to: ${newCommand}`);
        } catch (error) {
            vscode.window.showErrorMessage(`promptu: Failed to update setting: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Shows an input dialog for users to set a custom Copilot Chat command
     */
    public async setCopilotChatCommand(): Promise<void> {
        const currentCommand = this.chatCommand;
        
        const newCommand = await vscode.window.showInputBox({
            prompt: 'Enter the Copilot Chat command to use',
            value: currentCommand,
            placeHolder: 'e.g., workbench.action.chat.openagent',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Command cannot be empty';
                }
                return null;
            }
        });

        if (newCommand) {
            await this.updateChatCommandSetting(newCommand);
        }
    }

    /**
     * Discovers and displays available chat-related commands in VS Code
     */
    public async discoverChatCommands(): Promise<void> {
        try {
            // Get all available commands
            const allCommands = await vscode.commands.getCommands(true);
            
            // Filter for chat-related commands
            const chatCommands = allCommands.filter(cmd => cmd.includes('chat')).sort();

            if (chatCommands.length === 0) {
                vscode.window.showInformationMessage('promptu: No chat-related commands found. Make sure GitHub Copilot Chat is installed.');
                return;
            }

            // Show the commands in a quick pick
            const selectedCommand = await vscode.window.showQuickPick(chatCommands, {
                placeHolder: 'Select a command to use for Copilot Chat (or press Escape to cancel)',
                title: `Found ${chatCommands.length} chat-related commands`
            });

            if (selectedCommand) {
                await this.updateChatCommandSetting(selectedCommand);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`promptu: Error discovering commands: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

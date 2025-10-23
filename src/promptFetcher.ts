// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { ParsedPrompt } from './types';

/**
 * Fetches prompts from various sources including local files, Azure DevOps, and GitHub
 * @class PromptFetcher
 * @description
 * Provides a unified interface for fetching prompts from multiple sources with automatic
 * fallback strategies for authentication and access methods. Supports:
 * - Local file system access (absolute paths)
 * - Direct URLs (HTTP/HTTPS)
 * - Prompt name resolution from VS Code's configured locations
 * - Azure DevOps repositories (with organization/project/repo structure)
 * - GitHub repositories (with owner/repo structure)
 * 
 * Uses intelligent fallback mechanisms:
 * 1. Direct HTTP access (fastest for public repos)
 * 2. Authenticated HTTP access (fast for private repos)
 * 3. Git clone fallback (most reliable, works with all authentication methods)
 */
export class PromptFetcher {
    private static readonly defaultADOScope = "499b84ac-1321-427f-aa17-267ca6975798/.default";
    private static readonly fetchTimeout = 60000; // 60 seconds
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Fetches a prompt from various sources and writes it to the extension storage location
     * @param parsedPrompt - The parsed prompt object containing type and location information
     * @param context - The VS Code extension context for storage location
     * @returns Promise that resolves when the prompt is fetched and stored
     * @throws {Error} When the prompt cannot be fetched, parsed, or written
     */
    public async fetchPrompt(parsedPrompt: ParsedPrompt, context: vscode.ExtensionContext): Promise<void> {
        try {
            // Skip 'installed' type as it doesn't need fetching
            if (parsedPrompt.type === 'installed') {
                return;
            }
            
            let content: string;
            
            // Fetch prompt based on type
            switch (parsedPrompt.type) {
                case 'local':
                    this.outputChannel.appendLine('promptu: Copying local file...');
                    const sourceUri = vscode.Uri.file(parsedPrompt.localPath!);
                    await this.storePromptInStorage(sourceUri, parsedPrompt.name, context);
                    return;
                    
                case 'url':
                    this.outputChannel.appendLine('promptu: Fetching prompt from URL...');
                    content = await this.fetchViaHttp(parsedPrompt.url!, {});
                    await this.storePromptInStorage(content, parsedPrompt.name, context);
                    return;
                    
                case 'ado':
                case 'github':
                    // Try fast raw file fetch first, fall back to git clone if authentication is needed
                    this.outputChannel.appendLine('promptu: Fetching prompt from remote source...');
                    await this.fetchWithFallbackStrategyToFile(parsedPrompt, context);
                    return;

                default:
                    throw new Error(`Unsupported prompt type: ${parsedPrompt.type}`);
            }      
        } catch (error) {
            throw new Error(`Failed to fetch prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Unified method to store a prompt file from either a source URI or string content
     * @param source - Either a VS Code URI (for copying) or string content (for writing)
     * @param promptName - The name of the prompt (without extension)
     * @param context - The VS Code extension context
     * @returns Promise that resolves when the prompt is stored
     */
    private async storePromptInStorage(source: vscode.Uri | string, promptName: string, context: vscode.ExtensionContext): Promise<void> {
        try {
            // Ensure the prompts directory exists and is configured in VS Code settings
            const promptsDir = await this.ensurePromptsDirectory(context);
            
            // Create the destination file path
            const promptFileName = `${promptName}.prompt.md`;
            const destPath = path.join(promptsDir, promptFileName);
            const destUri = vscode.Uri.file(destPath);
            
            if (typeof source === 'string') {
                // Write content to file
                const contentBuffer = Buffer.from(source, 'utf8');
                await vscode.workspace.fs.writeFile(destUri, contentBuffer);
            } else {
                // Validate that source file exists before copying
                try {
                    await vscode.workspace.fs.stat(source);
                } catch (error) {
                    throw new Error(`Source file not found: ${source.fsPath}`);
                }
                
                // Copy file from source URI
                await vscode.workspace.fs.copy(source, destUri, { overwrite: true });
            }
            
        } catch (error) {
            const operation = typeof source === 'string' ? 'write content' : `copy file '${source.fsPath}'`;
            throw new Error(`Failed to ${operation} to storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Ensures that the prompts directory exists and is configured in VS Code settings
     * @param context - The VS Code extension context
     * @returns Promise that resolves to the absolute path of the prompts directory
     */
    private async ensurePromptsDirectory(context: vscode.ExtensionContext): Promise<string> {
        // Use VS Code's extension global storage path + prompts subfolder
        const globalStoragePath = context.globalStorageUri.fsPath;
        const promptsDir = path.join(globalStoragePath, 'prompts');
        const promptsDirUri = vscode.Uri.file(promptsDir);

        try {
            // Ensure the directory exists using VS Code's file system API
            await vscode.workspace.fs.createDirectory(promptsDirUri);

            // Get current chat.promptFilesLocations setting
            const chatConfig = vscode.workspace.getConfiguration('chat');
            const currentLocations: any = chatConfig.get('promptFilesLocations') || {};
            
            // Check if our directory is already in the setting
            if (!currentLocations[promptsDir]) {
                // Add our directory to the setting while preserving existing ones
                const updatedLocations = { ...currentLocations, [promptsDir]: true };
                
                // Update the VS Code setting
                await chatConfig.update('promptFilesLocations', updatedLocations, vscode.ConfigurationTarget.Global);
                
                // Show a one-time notification to the user
                vscode.window.showInformationMessage(
                    `promptu: Prompts folder created and configured. Fetched prompts are stored here and can be rerun in the chat window using '/<prompt name>'`,
                    'Open Folder'
                ).then(selection => {
                    if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(promptsDir));
                    }
                });
            }

            return promptsDir;

        } catch (error) {
            throw new Error(`Failed to setup prompts directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Fetches a prompt from remote Git source with fallback strategy, writing directly to storage
     * @param parsedPrompt - The parsed prompt information
     * @param context - The VS Code extension context
     * @returns Promise that resolves when the prompt is fetched and written to storage
     */
    private async fetchWithFallbackStrategyToFile(parsedPrompt: ParsedPrompt, context: vscode.ExtensionContext): Promise<void> {
        const rawUrl = this.buildRawFileUrl(parsedPrompt);
        let headers = {};
        
        try {
            // First try: Fetch raw file without authentication (fastest for public repos)
            if (parsedPrompt.type === 'ado') {
                // ADO requires authentication for raw file access
                headers = await this.getADOAuthHeaders();
            }
            const content = await this.fetchViaHttp(rawUrl, headers);
            this.outputChannel.appendLine('promptu: Fetched prompt using direct HTTP access');
            await this.storePromptInStorage(content, parsedPrompt.name, context);
        } catch (error) {
            // Final fallback: Use git clone and move file directly
            await this.fetchViaGitToFile(parsedPrompt, context);
            this.outputChannel.appendLine('promptu: Fetched prompt using git clone fallback');
        }
    }

    /**
     * Fetches content from a URL using HTTP with optional authentication headers
     * @param url - The URL to fetch content from
     * @param headers - HTTP headers to include in the request (typically for authentication)
     * @returns Promise that resolves to the response content as text
     * @throws {Error} When the HTTP request fails, times out, or returns an error status
     */
    private async fetchViaHttp(url: string, headers: Record<string, string>): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PromptFetcher.fetchTimeout);
        
        try {
            const response = await fetch(url, { 
                signal: controller.signal,
                headers: headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const content = await response.text();
            
            // Check if we got an HTML sign-in page instead of file content
            if (content.includes('<html') || content.includes('Sign in to your account')) {
                throw new Error('Authentication failed - received sign-in page');
            }
            
            return content;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timed out after ${PromptFetcher.fetchTimeout / 1000} seconds`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }


    /**
     * Fetches a prompt file via git clone and moves it directly to the storage location
     * @param parsedPrompt - The parsed prompt information containing repository details
     * @param context - The VS Code extension context
     * @returns Promise that resolves when the prompt is fetched and moved to storage
     */
    private async fetchViaGitToFile(parsedPrompt: ParsedPrompt, context: vscode.ExtensionContext): Promise<void> {
        const tempDir = path.join(os.tmpdir(), 'promptu-' + Date.now());
        
        try {
            // Build git clone URL
            const repoUrl = this.buildGitUrl(parsedPrompt);
            
            // Clone repository to temp directory
            await this.executeGitCommand(['clone', '--depth', '1', repoUrl, tempDir]);
            
            // Build source file path and create URI
            const sourceFilePath = path.join(tempDir, parsedPrompt.filePath!);
            const sourceUri = vscode.Uri.file(sourceFilePath);
            
            // Copy prompt file to storage
            await this.storePromptInStorage(sourceUri, parsedPrompt.name, context);
            
            // Clean up temp directory
            this.cleanupDirectory(tempDir);
            
        } catch (error) {
            // Clean up temp directory on error
            this.cleanupDirectory(tempDir);
            throw error;
        }
    }

    /**
     * Builds a raw file URL for direct HTTP access to repository files
     * @param parsedPrompt - The parsed prompt information containing repository details
     * @returns The raw file URL for the specified platform and file
     * @throws {Error} When the prompt type is not supported for raw file access
     * @description
     * Constructs platform-specific URLs for direct file access:
     * - ADO: Uses REST API format with text output
     * - GitHub: Uses raw.githubusercontent.com format
     */
    private buildRawFileUrl(parsedPrompt: ParsedPrompt): string {
        if (parsedPrompt.type === 'ado') {
            // ADO REST API format - works better with authentication
            return `https://${parsedPrompt.org}.visualstudio.com/${parsedPrompt.project}/_apis/git/repositories/${parsedPrompt.repo}/items?path=/${parsedPrompt.filePath}`;
        } else if (parsedPrompt.type === 'github') {
            // GitHub raw file URL format - uses default branch
            return `https://raw.githubusercontent.com/${parsedPrompt.owner}/${parsedPrompt.repo}/main/${parsedPrompt.filePath}`;
        }
        throw new Error(`Cannot build raw file URL for type: ${parsedPrompt.type}`);
    }

    /**
     * Builds a Git repository URL for cloning
     * @param parsedPrompt - The parsed prompt information containing repository details
     * @returns The Git clone URL for the specified platform and repository
     * @throws {Error} When the prompt type is not supported for Git operations
     * @description
     * Constructs platform-specific Git URLs:
     * - ADO: Uses Visual Studio Team Services format
     * - GitHub: Uses standard GitHub.com Git URL format
     */
    private buildGitUrl(parsedPrompt: ParsedPrompt): string {
        if (parsedPrompt.type === 'ado') {
            return `https://${parsedPrompt.org}.visualstudio.com/${parsedPrompt.project}/_git/${parsedPrompt.repo}`;
        } else if (parsedPrompt.type === 'github') {
            return `https://github.com/${parsedPrompt.owner}/${parsedPrompt.repo}.git`;
        }
        throw new Error(`Cannot build git URL for type: ${parsedPrompt.type}`);
    }

    /**
     * Gets an Azure DevOps access token from VS Code
     * @returns Promise that resolves to an object containing the Authorization header
     * @throws {Error} When the access token cannot be retrieved
     */
    private async getADOAuthHeaders(): Promise<Record<string, string>> {
        let session = await vscode.authentication.getSession("microsoft", [PromptFetcher.defaultADOScope], { silent: true});
        if (!session) {
            session = await vscode.authentication.getSession("microsoft", [PromptFetcher.defaultADOScope], { createIfNone: true });
        }
        if (session.accessToken) {
            this.outputChannel.appendLine("Got access token from VSCode");
            return { ["Authorization"]: `Bearer ${session.accessToken}` };
        }
        throw new Error("Failed to get access token from VSCode");
    }

    /**
     * Executes a Git command with timeout and error handling
     * @param args - Array of command line arguments to pass to Git
     * @returns Promise that resolves when the Git command completes successfully
     * @throws {Error} When the Git command fails, times out, or returns a non-zero exit code
     */
    private async executeGitCommand(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const process = spawn('git', args, { 
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: PromptFetcher.fetchTimeout 
            });
            
            let stderr = '';
            
            process.stderr?.on('data', (data) => {
                stderr += data.toString();
            });
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Git command failed (exit code ${code}): ${stderr}`));
                }
            });
            
            process.on('error', (error) => {
                reject(new Error(`Git command error: ${error.message}`));
            });
        });
    }

    /**
     * Safely removes a directory and all its contents
     * @param dirPath - The absolute path to the directory to remove
     */
    private cleanupDirectory(dirPath: string): void {
        try {
            if (fs.existsSync(dirPath)) {
                fs.rmSync(dirPath, { recursive: true, force: true });
            }
        } catch (error) {
            // Ignore cleanup errors silently
        }
    }
}

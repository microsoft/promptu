// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
import { McpServerConfig } from './types';

/**
 * Manages MCP client connections and prompt fetching
 */
export class McpClient {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Creates an authenticated HTTP transport with proper authorization headers
     * @param serverUrl - The MCP server URL to check for auth requirements
     * @returns StreamableHTTPClientTransport with authentication if needed
     */
    private async createAuthenticatedTransport(serverUrl: string): Promise<StreamableHTTPClientTransport> {
        try {
            this.outputChannel.appendLine(`promptu: Checking authentication requirements for ${serverUrl}...`);
            
            // Use MCP SDK's built-in discovery
            const resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl);
            
            if (resourceMetadata?.authorization_servers && resourceMetadata.authorization_servers.length > 0) {
                const authServer = resourceMetadata.authorization_servers[0];
                this.outputChannel.appendLine(`promptu: Auth server discovered: ${authServer}`);
                
                // Check if it's Microsoft OAuth
                if (authServer.includes('login.microsoftonline.com')) {
                    const scopes = resourceMetadata.scopes_supported || [];
                    this.outputChannel.appendLine(`promptu: Microsoft OAuth detected, scopes: ${scopes.join(', ')}`);
                    
                    // Get VS Code Microsoft token
                    const session = await vscode.authentication.getSession("microsoft", scopes, { createIfNone: true });
                    if (session?.accessToken) {
                        this.outputChannel.appendLine(`promptu: Got Microsoft access token, creating authenticated transport`);
                        
                        // Create transport with Authorization header
                        return new StreamableHTTPClientTransport(new URL(serverUrl), {
                            requestInit: {
                                headers: {
                                    ['Authorization']: `Bearer ${session.accessToken}`
                                }
                            }
                        });
                    } else {
                        throw new Error('Microsoft authentication failed or was cancelled');
                    }
                } else {
                    this.outputChannel.appendLine(`promptu: Non-Microsoft OAuth detected (${authServer}), not supported`);
                    throw new Error(`OAuth server ${authServer} not supported. Currently only Microsoft OAuth is supported.`);
                }
            }
            
            this.outputChannel.appendLine(`promptu: No authentication required for ${serverUrl}`);
            // No auth needed - create basic transport
            return new StreamableHTTPClientTransport(new URL(serverUrl));
            
        } catch (error) {
            if (error instanceof Error && error.message.includes('not supported')) {
                // Re-throw auth errors
                throw error;
            }
            
            // Auth discovery failed - try without auth (might be public MCP)
            this.outputChannel.appendLine(`promptu: Auth discovery failed, trying without auth: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return new StreamableHTTPClientTransport(new URL(serverUrl));
        }
    }

    /**
     * Creates a new MCP client for the specified server
     * @param serverName - Name of the MCP server
     * @param serverConfig - Configuration for the MCP server
     * @returns Connected MCP client
     */
    private async createClient(serverName: string, serverConfig: McpServerConfig): Promise<Client> {
        // Create new client
        const client = new Client({
            name: 'promptu-extension',
            version: '0.0.1'
        });

        // Create transport based on server type
        let transport;
        if (serverConfig.type === 'stdio') {
            if (!serverConfig.command) {
                throw new Error(`MCP server '${serverName}' requires a command for stdio transport`);
            }

            transport = new StdioClientTransport({
                command: serverConfig.command,
                args: serverConfig.args || []
            });
        } else if (serverConfig.type === 'http') {
            if (!serverConfig.url) {
                throw new Error(`MCP server '${serverName}' requires a URL for HTTP transport`);
            }

            // Create authenticated transport (handles auth discovery and token injection)
            transport = await this.createAuthenticatedTransport(serverConfig.url);
        } else {
            throw new Error(`MCP server transport type '${serverConfig.type}' not supported`);
        }

        this.outputChannel.appendLine(`promptu: Connecting to MCP server '${serverName}'...`);
        
        try {
            await client.connect(transport);
            this.outputChannel.appendLine(`promptu: Successfully connected to MCP server '${serverName}'`);
            return client;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            
            // Provide helpful error messages for auth-related failures
            if (message.includes('Unauthorized') || message.includes('401') || message.includes('403')) {
                throw new Error(`Authentication failed for MCP server '${serverName}'. Currently only Microsoft OAuth is supported. Please ensure you have access to the required scopes.`);
            }
            
            throw new Error(`Failed to connect to MCP server '${serverName}': ${message}`);
        }
    }

    /**
     * Gets an MCP prompt content by handling the full workflow from prompt name to rendered content
     * @param mcpPromptName - The full MCP prompt name (format: mcp.ServerName.PromptName)
     * @param input - JSON input arguments for the prompt
     * @param mcpServers - Array of all MCP server configurations
     * @returns The rendered prompt content from the MCP server
     * @throws {Error} When MCP prompt format is invalid, server not found, or fetching fails
     */
    async getPrompt(
        mcpPromptName: string,
        input: string,
        mcpServers: McpServerConfig[]
    ): Promise<string> {
        // Parse MCP prompt format: mcp.ServerName.PromptName
        const mcpParts = mcpPromptName.split('.');
        if (mcpParts.length !== 3 || mcpParts[0] !== 'mcp') {
            throw new Error('Invalid MCP prompt format. Expected: mcp.ServerName.PromptName');
        }
        
        const serverName = mcpParts[1];
        const promptName = mcpParts[2];
        
        // Find the server in the provided URI configuration
        const serverConfig = mcpServers?.find((server: McpServerConfig) => server.name === serverName);
        
        if (!serverConfig) {
            throw new Error(`MCP server '${serverName}' not found in provided configuration. The MCP server must be specified in the URI.`);
        }
        
        // Parse input arguments - MCP prompts require JSON format
        let promptArgs: Record<string, any> = {};
        if (input) {
            try {
                // Parse as JSON - this gives us explicit argument names and typed values
                const parsed = JSON.parse(input);
                
                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    // Perfect! JSON object with string keys and typed values
                    promptArgs = parsed;
                } else {
                    throw new Error('MCP prompt input must be a JSON object with argument names and values');
                }
            } catch (parseError) {
                throw new Error(`MCP prompt input must be valid JSON object format. Example: {"name": "value", "count": 5}. Error: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`);
            }
        }
        
        // Create mcp client
        const client = await this.createClient(serverName, serverConfig);
        
        this.outputChannel.appendLine(`promptu: Fetching prompt '${promptName}' from MCP server '${serverName}'...`);
        
        try {
            // Call prompts/get on the MCP server
            const response = await client.getPrompt({
                name: promptName,
                arguments: promptArgs
            });

            // Extract the text content from the response
            if (response.messages && response.messages.length > 0) {
                const message = response.messages[0];
                if (message.content?.type === 'text') {
                    this.outputChannel.appendLine(`promptu: Successfully fetched prompt from MCP server`);
                    return message.content.text;
                }
            }

            throw new Error('No text content found in MCP prompt response');

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`promptu: Error fetching MCP prompt: ${message}`);
            throw new Error(`Failed to fetch prompt '${promptName}' from MCP server '${serverName}': ${message}`);
        } finally {
            try {
                await client.close();
                this.outputChannel.appendLine(`promptu: Closed connection to MCP server '${serverName}'`);
            } catch (closeError) {
                this.outputChannel.appendLine(`promptu: Error closing MCP client '${serverName}': ${closeError instanceof Error ? closeError.message : 'Unknown error'}`);
            }
        }
    }

    /**
     * Lists all available prompts from an MCP server (debugging function)
     * @param serverConfig - MCP server configuration
     * @returns Array of available prompt names
     * @throws {Error} When listing fails
     */
    async listPrompts(serverConfig: McpServerConfig): Promise<string[]> {
        this.outputChannel.appendLine(`promptu: Listing prompts from MCP server '${serverConfig.name}'...`);
        
        // Create MCP client
        const client = await this.createClient(serverConfig.name, serverConfig);
        
        try {
            // Call prompts/list on the MCP server
            const response = await client.listPrompts();
            
            this.outputChannel.appendLine(`promptu: MCP prompts/list response:`);
            this.outputChannel.appendLine(JSON.stringify(response, null, 2));
            
            const promptNames: string[] = [];
            for (const prompt of response.prompts) {
                promptNames.push(prompt.name);
            }
            
            return promptNames;
            
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`promptu: Error listing MCP prompts: ${message}`);
            throw new Error(`Failed to list prompts from MCP server '${serverConfig.name}': ${message}`);
        } finally {
            try {
                await client.close();
                this.outputChannel.appendLine(`promptu: Closed connection to MCP server '${serverConfig.name}'`);
            } catch (closeError) {
                this.outputChannel.appendLine(`promptu: Error closing MCP client '${serverConfig.name}': ${closeError instanceof Error ? closeError.message : 'Unknown error'}`);
            }
        }
    }
}
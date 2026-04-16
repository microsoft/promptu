// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
import { McpServerConfig } from './types';

/**
 * Parses a WWW-Authenticate header for Bearer challenge parameters.
 * Extracts scope, resource_metadata, and error values.
 */
export function parseWWWAuthenticateBearer(header: string | null): { scope?: string; resourceMetadata?: string; error?: string } {
    if (!header) {
        return {};
    }
    const result: { scope?: string; resourceMetadata?: string; error?: string } = {};
    const bearerMatch = header.match(/Bearer\s+(.*)/i);
    if (!bearerMatch) {
        return result;
    }
    const params = bearerMatch[1];
    const scopeMatch = params.match(/\bscope="([^"]+)"/);
    if (scopeMatch) {
        result.scope = scopeMatch[1];
    }
    const metadataMatch = params.match(/\bresource_metadata="([^"]+)"/);
    if (metadataMatch) {
        result.resourceMetadata = metadataMatch[1];
    }
    const errorMatch = params.match(/\berror="([^"]+)"/);
    if (errorMatch) {
        result.error = errorMatch[1];
    }
    return result;
}

/**
 * Fetches a URL with manual redirect handling -- only follows HTTPS redirects.
 */
async function safeFetch(fetchFn: (url: string | URL, init?: any) => Promise<any>, url: string, init?: any): Promise<any> {
    const maxRedirects = 5;
    let currentUrl = url;
    for (let i = 0; i < maxRedirects; i++) {
        const response = await fetchFn(currentUrl, { ...init, redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(response.status)) {
            return response;
        }
        const location = response.headers.get('location');
        if (!location) {
            return response;
        }
        const redirectUrl = new URL(location, currentUrl);
        if (redirectUrl.protocol !== 'https:') {
            return response; // Don't follow non-HTTPS redirects
        }
        currentUrl = redirectUrl.toString();
    }
    throw new Error('Too many redirects');
}

/**
 * Manages MCP client connections and prompt fetching
 */
export class McpClient {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Creates an authenticated HTTP transport that handles auth via a
     * "connect -> 401 -> parse WWW-Authenticate -> get token -> retry" pattern.
     *
     * 1. Attempts upfront RFC 9728 discovery for scopes (best case).
     * 2. If discovery fails, connects without auth and relies on the 401
     *    response's WWW-Authenticate header to learn the required scopes.
     * 3. Acquires a Microsoft token via VS Code's authentication API.
     * 4. Retries the original request with the Bearer token.
     *
     * @param serverUrl - The MCP server URL
     * @returns StreamableHTTPClientTransport with auth-retry fetch wrapper
     */
    private async createAuthenticatedTransport(serverUrl: string): Promise<StreamableHTTPClientTransport> {
        this.outputChannel.appendLine(`promptu: Creating transport for ${serverUrl}...`);

        // Use globalThis.fetch -- available in Node 18+ (VS Code extension host)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nativeFetch = (globalThis as any).fetch as (url: string | URL, init?: any) => Promise<any>;

        // Mutable state shared across requests within this transport
        let currentScopes: string[] | undefined;
        let currentToken: string | undefined;
        // Serialize token acquisition to avoid duplicate auth prompts
        let pendingTokenRequest: Promise<string | undefined> | undefined;

        // --- Phase 1: Try upfront RFC 9728 discovery (optional, best-effort) ---
        try {
            const resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl);
            if (resourceMetadata?.authorization_servers?.length) {
                const authServer = resourceMetadata.authorization_servers[0];
                if (new URL(authServer).hostname === 'login.microsoftonline.com') {
                    currentScopes = resourceMetadata.scopes_supported || [];
                    this.outputChannel.appendLine(`promptu: Discovered scopes from metadata: ${currentScopes.join(', ')}`);
                }
            }
        } catch {
            this.outputChannel.appendLine(`promptu: No OAuth metadata found, will authenticate on demand if needed`);
        }

        // If we got scopes from discovery, pre-acquire a token
        if (currentScopes?.length) {
            try {
                const session = await vscode.authentication.getSession("microsoft", currentScopes, { createIfNone: true });
                currentToken = session?.accessToken;
                if (currentToken) {
                    this.outputChannel.appendLine(`promptu: Pre-acquired token from discovered scopes`);
                }
            } catch (e) {
                this.outputChannel.appendLine(`promptu: Pre-auth failed, will retry on 401: ${e instanceof Error ? e.message : 'Unknown error'}`);
            }
        }

        // Helper: acquire a token, serialized to avoid duplicate prompts
        const acquireToken = async (scopes: string[]): Promise<string | undefined> => {
            if (pendingTokenRequest) {
                return pendingTokenRequest;
            }
            pendingTokenRequest = (async () => {
                try {
                    this.outputChannel.appendLine(`promptu: Acquiring Microsoft token with scopes: ${scopes.join(', ')}`);
                    const session = await vscode.authentication.getSession("microsoft", scopes, { createIfNone: true });
                    currentToken = session?.accessToken;
                    return currentToken;
                } catch (e) {
                    this.outputChannel.appendLine(`promptu: Token acquisition failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
                    return undefined;
                } finally {
                    pendingTokenRequest = undefined;
                }
            })();
            return pendingTokenRequest;
        };

        // --- Phase 2: Create fetch wrapper with 401 retry ---
        // The wrapper has the same signature as globalThis.fetch (FetchLike)
        const authFetch = async (url: string | URL, init?: any): Promise<any> => {
            // Build headers preserving any existing ones from the SDK
            const headers: Record<string, string> = {};
            if (init?.headers) {
                // Handle Headers object, array, or plain object
                // Check Array.isArray first since arrays also have forEach
                if (Array.isArray(init.headers)) {
                    for (const [key, value] of init.headers) { headers[key] = value; }
                } else if (typeof init.headers.forEach === 'function') {
                    init.headers.forEach((value: string, key: string) => { headers[key] = value; });
                } else {
                    Object.assign(headers, init.headers);
                }
            }

            // Inject current token if available
            if (currentToken) {
                headers['Authorization'] = `Bearer ${currentToken}`;
            }

            let response = await nativeFetch(url, { ...init, headers });

            // Handle 401/403 -- parse WWW-Authenticate and retry with a fresh token
            if (response.status === 401 || response.status === 403) {
                this.outputChannel.appendLine(`promptu: Got ${response.status} from server, attempting auth retry...`);

                const wwwAuth = parseWWWAuthenticateBearer(response.headers.get('WWW-Authenticate'));
                const mcpServerOrigin = new URL(serverUrl).origin;

                // Update scopes from inline challenge if provided
                if (wwwAuth.scope) {
                    currentScopes = wwwAuth.scope.split(' ').filter(s => s.trim().length > 0);
                    this.outputChannel.appendLine(`promptu: Scopes from WWW-Authenticate: ${currentScopes.join(', ')}`);
                }

                // If no inline scopes, try fetching resource metadata from the challenge URL
                // Per RFC 9728 Section 5, resource_metadata URLs may be cross-origin.
                // Security is enforced by validating the metadata's resource field matches the MCP server.
                if (!currentScopes?.length && wwwAuth.resourceMetadata) {
                    try {
                        const metadataUrl = new URL(wwwAuth.resourceMetadata);

                        if (metadataUrl.protocol !== 'https:') {
                            this.outputChannel.appendLine(`promptu: Rejecting resource_metadata URL -- must be HTTPS`);
                        } else {
                            this.outputChannel.appendLine(`promptu: Fetching resource metadata from challenge: ${wwwAuth.resourceMetadata}`);
                            const metadataResponse = await safeFetch(nativeFetch, wwwAuth.resourceMetadata);
                            if (metadataResponse.ok) {
                                const metadata = await metadataResponse.json() as any;

                                // Security: validate that metadata.resource matches the MCP server URL (RFC 9728)
                                if (metadata.resource) {
                                    const resourceUrl = new URL(metadata.resource);
                                    const serverUrlObj = new URL(serverUrl);
                                    const metadataResource = `${resourceUrl.origin}${resourceUrl.pathname.replace(/\/$/, '')}`;
                                    const expectedResource = `${serverUrlObj.origin}${serverUrlObj.pathname.replace(/\/$/, '')}`;
                                    if (metadataResource !== expectedResource) {
                                        this.outputChannel.appendLine(`promptu: Rejecting resource metadata -- resource "${metadataResource}" does not match MCP server "${expectedResource}"`);
                                    } else if (metadata.scopes_supported?.length) {
                                        currentScopes = metadata.scopes_supported;
                                        this.outputChannel.appendLine(`promptu: Scopes from resource metadata: ${currentScopes!.join(', ')}`);
                                    }
                                } else {
                                    this.outputChannel.appendLine(`promptu: Resource metadata missing required 'resource' field, skipping`);
                                }
                            }
                        }
                    } catch (e) {
                        this.outputChannel.appendLine(`promptu: Failed to fetch resource metadata: ${e instanceof Error ? e.message : 'Unknown error'}`);
                    }
                }

                // If we still have no scopes, try well-known paths per RFC 9728 Section 3
                // The well-known URI is inserted between host and path components
                if (!currentScopes?.length) {
                    const serverUrlObj = new URL(serverUrl);
                    const hasPath = serverUrlObj.pathname !== '/';
                    const wellKnownBase = `${serverUrlObj.origin}/.well-known/oauth-protected-resource`;

                    // Try path-appended first (for servers with path components)
                    if (hasPath) {
                        try {
                            const pathAppendedUrl = `${wellKnownBase}${serverUrlObj.pathname}`;
                            this.outputChannel.appendLine(`promptu: Trying well-known metadata at ${pathAppendedUrl}`);
                            const metadataResponse = await safeFetch(nativeFetch, pathAppendedUrl);
                            if (metadataResponse.ok) {
                                const metadata = await metadataResponse.json() as any;
                                if (metadata.scopes_supported?.length) {
                                    currentScopes = metadata.scopes_supported;
                                    this.outputChannel.appendLine(`promptu: Scopes from well-known metadata: ${currentScopes!.join(', ')}`);
                                }
                            }
                        } catch {
                            // Path-appended well-known not available, try root
                        }
                    }

                    // Try root well-known
                    if (!currentScopes?.length) {
                        try {
                            this.outputChannel.appendLine(`promptu: Trying well-known metadata at ${wellKnownBase}`);
                            const metadataResponse = await safeFetch(nativeFetch, wellKnownBase);
                            if (metadataResponse.ok) {
                                const metadata = await metadataResponse.json() as any;
                                if (metadata.scopes_supported?.length) {
                                    currentScopes = metadata.scopes_supported;
                                    this.outputChannel.appendLine(`promptu: Scopes from well-known metadata: ${currentScopes!.join(', ')}`);
                                }
                            }
                        } catch {
                            // Root well-known not available, continue
                        }
                    }
                }

                // Acquire token and retry if we have scopes
                if (currentScopes?.length) {
                    const token = await acquireToken(currentScopes);
                    if (token) {
                        headers['Authorization'] = `Bearer ${token}`;
                        this.outputChannel.appendLine(`promptu: Retrying request with auth token...`);
                        response = await nativeFetch(url, { ...init, headers });
                    }
                } else {
                    this.outputChannel.appendLine(`promptu: No scopes discovered from server's 401 challenge -- cannot determine authentication requirements. Ensure the server returns a WWW-Authenticate header with scope or resource_metadata parameters.`);
                }
            }

            return response;
        };

        return new StreamableHTTPClientTransport(new URL(serverUrl), { fetch: authFetch });
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
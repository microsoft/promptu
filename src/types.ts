// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Represents a parsed prompt with its type and location information
 * @interface ParsedPrompt
 * 
 * Supported prompt types:
 * - 'ado': Azure DevOps repository prompts (ado:org/project/repo/path)
 * - 'github': GitHub repository prompts (gh:owner/repo/path)
 * - 'url': Direct HTTP/HTTPS URLs to prompt files
 * - 'local': Local file system paths (absolute paths)
 * - 'installed': VS Code slash command prompts (already available locally)
 * - 'mcp': Model Context Protocol server prompts (mcp.ServerName.PromptName)
 */
export interface ParsedPrompt {
    /** 
     * The type of prompt source
     * - 'ado': Azure DevOps repository
     * - 'github': GitHub repository  
     * - 'url': Direct HTTP/HTTPS URL
     * - 'local': Local file system
     * - 'installed': VS Code slash command (no fetching needed)
     * - 'mcp': MCP server prompt
     */
    type: 'ado' | 'github' | 'url' | 'local' | 'installed' | 'mcp';
    /** 
     * The extracted name for the prompt
     * - For remote, local, and installed prompts: filename without extension (e.g., 'code-review')
     * - For MCP prompts: full MCP identifier (e.g., 'mcp.server.prompt')
     */
    name: string;
    /** Direct URL for 'url' type prompts (e.g., 'https://example.com/prompt.md') */
    url?: string;
    /** Azure DevOps organization name for 'ado' type prompts (e.g., 'myorg') */
    org?: string;
    /** Azure DevOps project name for 'ado' type prompts (e.g., 'myproject') */
    project?: string;
    /** Repository name for 'ado' and 'github' type prompts (e.g., 'myrepo') */
    repo?: string;
    /** GitHub repository owner for 'github' type prompts (e.g., 'username' or 'orgname') */
    owner?: string;
    /** File path within the repository for remote prompts (e.g., 'prompts/code-review.md') */
    filePath?: string;
    /** Local file system path for 'local' type prompts (e.g., 'C:\\prompts\\debug.md') */
    localPath?: string;
}

/**
 * Represents MCP server configuration for installation and setup
 * @interface McpServerConfig
 */
export interface McpServerConfig {
    /** The name/identifier for the MCP server */
    name: string;
    /** The type of MCP server transport protocol */
    type: 'stdio' | 'http';
    /** For stdio servers - the command to execute */
    command?: string;
    /** For stdio servers - command line arguments */
    args?: string[];
    /** For http servers - the URL endpoint */
    url?: string;
    /** Environment variables for the server */
    env?: Record<string, string | number | null>;
    /** NuGet package name for installation (if specified, will install via dotnet tool) */
    nugetPackage?: string;
    /** Package version (optional, defaults to latest) */
    version?: string;
    /** Custom NuGet feed URL (optional, uses default feed if not specified) */
    nugetFeed?: string;
}

/**
 * Represents workspace configuration for prompt execution
 * @interface WorkspaceConfig
 */
export interface WorkspaceConfig {
    /** The type of workspace handling - 'current' uses current workspace, 'select' shows selection dialog */
    type: 'current' | 'select';
    /** Optional message to show in the workspace selection dialog */
    message?: string;
}

/**
 * Structure of the user's mcp.json configuration file
 * @interface McpConfiguration
 */
export interface McpConfiguration {
    servers: Record<string, {
        type: 'stdio' | 'http';
        command?: string;
        args?: string[];
        url?: string;
        env?: Record<string, string | number | null>;
    }>;
    inputs: any[];
}
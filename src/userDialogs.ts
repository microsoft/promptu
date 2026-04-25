// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { ParsedPrompt, McpServerConfig, McpConfiguration } from './types';

/**
 * Shows confirmation dialog for prompt execution
 * @param parsedPrompt - The parsed prompt information
 * @param input - Input data for the prompt
 * @param mcpServers - Array of MCP server configurations
 * @returns Promise that resolves to true if user confirmed, false if cancelled
 */
export async function showPromptConfirmation(
    parsedPrompt: ParsedPrompt, 
    input: string, 
    mcpServers: McpServerConfig[]
): Promise<boolean> {
    const details = buildPromptDetailsMessage(parsedPrompt, input, mcpServers);
    
    const result = await vscode.window.showWarningMessage(
        'promptu: An external application wants to execute a prompt',
        {
            detail: details,
            modal: true
        },
        'Yes'
    );
    
    return result === 'Yes';
}

/**
 * Shows confirmation dialog for MCP server installation or update
 * @param server - MCP server configuration to install
 * @param installedVersion - If set, indicates this is an update from this version
 * @returns Promise that resolves to true if user wants to proceed, false if cancelled
 */
export async function showMcpInstallationConfirmation(server: McpServerConfig, installedVersion?: string): Promise<boolean> {
    const isUpdate = !!installedVersion;
    const details = buildMcpInstallationDetailsMessage(server, installedVersion);
    
    const action = isUpdate ? 'Update' : 'Install';
    const result = await vscode.window.showWarningMessage(
        isUpdate
            ? `promptu: MCP server '${server.name}' needs to be updated to run this prompt.`
            : `promptu: MCP server '${server.name}' is required to execute this prompt but is not installed.`,
        {
            detail: details,
            modal: true
        },
        action
    );
    
    return result === action;
}

/**
 * Shows confirmation dialog for MCP server config update with three options
 * @param server - The new MCP server configuration from the prompt link
 * @param existingConfig - The user's current configuration for this server
 * @returns 'update' if user wants to update, 'skip' to keep existing, 'suppress' to skip and don't ask again, 'cancel' if dismissed
 */
export async function showMcpUpdateConfirmation(
    server: McpServerConfig,
    existingConfig: McpConfiguration['servers'][string]
): Promise<'update' | 'skip' | 'suppress' | 'cancel'> {
    const details = buildMcpUpdateDetailsMessage(server, existingConfig);

    const result = await vscode.window.showWarningMessage(
        `promptu: MCP server '${server.name}' may need to be updated for this prompt.`,
        { detail: details, modal: true },
        'Update',
        'Skip',
        'Skip & Don\'t Ask Again'
    );

    if (result === 'Update') return 'update';
    if (result === 'Skip') return 'skip';
    if (result === 'Skip & Don\'t Ask Again') return 'suppress';
    return 'cancel';
}

/**
 * Builds the detailed message for MCP update confirmation showing current and new configs
 * @param server - The new MCP server configuration
 * @param existingConfig - The user's current server configuration
 * @returns Formatted details message
 */
function buildMcpUpdateDetailsMessage(
    server: McpServerConfig,
    existingConfig: McpConfiguration['servers'][string]
): string {
    const lines: string[] = [];

    // Current configuration
    lines.push('Current Configuration');
    lines.push(`Type: ${existingConfig.type}`);
    if (existingConfig.command) lines.push(`Command: ${existingConfig.command}`);
    if (existingConfig.args && existingConfig.args.length > 0) lines.push(`Arguments: ${existingConfig.args.join(' ')}`);
    if (existingConfig.url) lines.push(`URL: ${formatLongPath(existingConfig.url)}`);
    if (existingConfig.env && Object.keys(existingConfig.env).length > 0) {
        lines.push('Environment Variables:');
        Object.entries(existingConfig.env).forEach(([key, value]) => {
            lines.push(`  ${key}=${value}`);
        });
    }

    lines.push('');

    // New configuration
    lines.push('New Configuration');
    lines.push(`Type: ${server.type}`);
    if (server.command) lines.push(`Command: ${server.command}`);
    if (server.args && server.args.length > 0) lines.push(`Arguments: ${server.args.join(' ')}`);
    if (server.url) lines.push(`URL: ${formatLongPath(server.url)}`);
    if (server.env && Object.keys(server.env).length > 0) {
        lines.push('Environment Variables:');
        Object.entries(server.env).forEach(([key, value]) => {
            lines.push(`  ${key}=${value}`);
        });
    }

    lines.push('');
    lines.push('"Update" will install the new configuration.');
    lines.push('"Skip" will keep your current configuration and continue.');
    lines.push('');
    lines.push('⚠️ If you skip, the prompt may not work as expected.');

    return lines.join('\n');
}

/**
 * Builds the detailed message for prompt execution confirmation
 * @param parsedPrompt - The parsed prompt information
 * @param input - Input data for the prompt
 * @param mcpServers - Array of MCP server configurations
 * @returns Formatted details message
 */
function buildPromptDetailsMessage(parsedPrompt: ParsedPrompt, input: string, mcpServers: McpServerConfig[]): string {
    const lines: string[] = [
        'Do not proceed if you did not initiate this request.',
        '',
        '📂 Prompt Source',
        formatPromptSource(parsedPrompt),
        ''
    ];
    
    // Add input section if provided
    if (input?.length > 0) {
        lines.push('📝 Input Data');
        const truncatedInput = input.length > 150 ? `${input.substring(0, 150)}...` : input;
        lines.push(`"${truncatedInput}"`);
        lines.push('');
    }
    
    // Add MCP servers section if provided
    if (mcpServers.length > 0) {
        lines.push('🔧 Required MCP Servers');
        mcpServers.forEach(server => {
            lines.push(`• ${server.name}`);
        });
        lines.push('');
    }
    
    lines.push('Do you want to execute this prompt?');
    
    return lines.join('\n');
}

/**
 * Builds the detailed message for MCP installation/update confirmation
 * @param server - MCP server configuration
 * @param installedVersion - If set, indicates this is an update from this version
 * @returns Formatted details message
 */
function buildMcpInstallationDetailsMessage(server: McpServerConfig, installedVersion?: string): string {
    const isUpdate = !!installedVersion;
    const lines: string[] = [
        'Do not proceed if you did not initiate this request.',
        '',
        '🔧 MCP Server Details',
        `Name: ${server.name}`,
        `Type: ${server.type}`,
    ];

    // Add server-specific configuration details
    if (server.command) {
        lines.push(`Command: ${server.command}`);
    }
    
    if (server.args && server.args.length > 0) {
        lines.push(`Arguments: ${server.args.join(' ')}`);
    }
    
    if (server.url) {
        lines.push(`URL: ${formatLongPath(server.url)}`);
    }
    
    if (server.env && Object.keys(server.env).length > 0) {
        lines.push('Environment Variables:');
        Object.entries(server.env).forEach(([key, value]) => {
            lines.push(`  ${key}=${value}`);
        });
    }
    
    lines.push('');

    // NuGet-specific details
    if (server.nugetPackage) {
        lines.push(
            isUpdate ? '📦 Update Details' : '📦 Installation Details',
            `Package: ${server.nugetPackage}`
        );
        
        if (isUpdate) {
            lines.push(`Current Version: ${installedVersion}`);
        }

        if (server.version) {
            lines.push(`${isUpdate ? 'New Version' : 'Version'}: ${server.version}`);
        }

        // Format feed URL for better readability if custom feed is specified
        if (server.nugetFeed) {
            lines.push(`Feed: ${formatLongPath(server.nugetFeed)}`);
        } else {
            lines.push('Feed: Default NuGet feed');
        }
        
        lines.push(
            '',
            "The 'dotnet' command is required to install this package.",
        );

        if (isUpdate) {
            lines.push(
                `This will update the tool using 'dotnet tool update --global'.`,
                'If the tool is currently running, it will be stopped before updating.',
            );
        } else {
            lines.push(
                "Installation will use 'dotnet tool install --global'",
            );
        }

        lines.push('');
    }
    
    lines.push(
        '📝 Configuration',
        'The server will be added to your MCP configuration file.',
        '',
        `Do you want to ${isUpdate ? 'update' : 'install'} this MCP Server?`
    );
    
    return lines.join('\n');
}

/**
 * Formats the prompt source information for display
 * @param parsedPrompt - The parsed prompt information
 * @returns Formatted prompt source string
 */
function formatPromptSource(parsedPrompt: ParsedPrompt): string {
    switch (parsedPrompt.type) {
        case 'github':
            const githubUrl = `https://github.com/${parsedPrompt.owner}/${parsedPrompt.repo}/blob/main/${parsedPrompt.filePath}`;
            return `GitHub: ${formatLongPath(githubUrl)}`;
        case 'ado':
            const adoUrl = `https://dev.azure.com/${parsedPrompt.org}/${parsedPrompt.project}/_git/${parsedPrompt.repo}?path=/${parsedPrompt.filePath}`;
            return `Azure DevOps: ${formatLongPath(adoUrl)}`;
        case 'url':
            return `URL: ${formatLongPath(parsedPrompt.url!)}`;
        case 'local':
            return `Local File: ${formatLongPath(parsedPrompt.localPath!)}`;
        case 'mcp':
            return `MCP Prompt: ${parsedPrompt.name}`;
        case 'installed':
            return `Installed Prompt: ${parsedPrompt.name}`;
        default:
            throw new Error(`Unknown prompt type: ${parsedPrompt.type}. This indicates a bug in the prompt parsing logic.`);
    }
}

/**
 * Formats a long URL or file path for better readability by breaking it across multiple lines
 * @param pathOrUrl - The URL or file path to format
 * @returns Formatted string with line breaks for better readability
 */
function formatLongPath(pathOrUrl: string): string {
    const maxLineLength = 70;
    
    // If path/URL is short enough, return as single line
    if (pathOrUrl.length <= maxLineLength) {
        return pathOrUrl;
    }

    const lines: string[] = [];
    let remainingPath = pathOrUrl;
    
    // Determine separator (use both '/' and '\' for Windows paths)
    const separators = ['/', '\\'];
    
    while (remainingPath.length > maxLineLength) {
        const searchLength = Math.min(remainingPath.length, maxLineLength);
        let splitIndex = -1;
        
        // Find the last separator before the line length limit
        for (const separator of separators) {
            const index = remainingPath.lastIndexOf(separator, searchLength - 1);
            if (index > splitIndex) {
                splitIndex = index;
            }
        }
        
        // If no separator found within limit, just split at the limit
        if (splitIndex === -1) {
            splitIndex = maxLineLength;
        }
        
        // Add this line to our array
        lines.push(remainingPath.substring(0, splitIndex));
        
        // Update remaining path (remove what we just processed)
        remainingPath = remainingPath.substring(splitIndex);
    }
    
    // Add the final piece (what's left)
    if (remainingPath.length > 0) {
        lines.push(remainingPath);
    }
    
    return lines.join('\n');
}
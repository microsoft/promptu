// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { ParsedPrompt, McpServerConfig } from './types';

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
 * Shows confirmation dialog for MCP server installation
 * @param server - MCP server configuration to install
 * @returns Promise that resolves to true if user wants to install, false if cancelled
 */
export async function showMcpInstallationConfirmation(server: McpServerConfig): Promise<boolean> {
    const details = buildMcpInstallationDetailsMessage(server);
    
    const result = await vscode.window.showWarningMessage(
        `promptu: MCP server '${server.name}' is required to execute this prompt but is not installed.`,
        {
            detail: details,
            modal: true
        },
        'Install'
    );
    
    return result === 'Install';
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
 * Builds the detailed message for MCP installation confirmation
 * @param server - MCP server configuration
 * @returns Formatted details message
 */
function buildMcpInstallationDetailsMessage(server: McpServerConfig): string {
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
            '📦 Installation Details',
            `Package: ${server.nugetPackage}`
        );
        
        // Format feed URL for better readability if custom feed is specified
        if (server.nugetFeed) {
            lines.push(`Feed: ${formatLongPath(server.nugetFeed)}`);
        } else {
            lines.push('Feed: Default NuGet feed');
        }

        // Add version if specified
        if (server.version) {
            lines.push(`Version: ${server.version}`);
        }
        
        lines.push(
            '',
            "The 'dotnet' command is required to install this package.",
            "Installation will use 'dotnet tool install --global'",
            ''
        );
    }
    
    lines.push(
        '📝 Configuration',
        'The server will be added to your MCP configuration file.',
        '',
        'Do you want to install this MCP Server?'
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
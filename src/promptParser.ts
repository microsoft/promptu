// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ParsedPrompt, WorkspaceConfig } from './types';

/**
 * Parses a prompt string to determine its type and extract relevant information
 * @param prompt - The prompt string to parse:
 *   - Platform shortcuts: 'ado:org/project/repo/path', 'gh:owner/repo/path'
 *   - URLs: 'https://example.com/prompt.md'
 *   - Absolute paths: 'C:\path\prompt.md', '/path/prompt.md'
 *   - Prompt names: 'code-review' (resolved from configured locations)
 * @returns Parsed prompt object containing type and location information
 * @throws {Error} When the prompt format is invalid or unsupported
 */
export function parsePrompt(prompt: string): ParsedPrompt {
    // Check for MCP prompt format: mcp.ServerName.PromptName
    if (prompt.startsWith('mcp.')) {
        const mcpParts = prompt.split('.');
        if (mcpParts.length !== 3) {
            throw new Error('Invalid MCP prompt format. Expected: mcp.ServerName.PromptName');
        }
        
        return {
            type: 'mcp',
            name: prompt, // Store the full MCP identifier
        };
    }

    // Check if it's a direct URL
    if (prompt.startsWith('http://') || prompt.startsWith('https://')) {
        return {
            type: 'url',
            name: getPromptName(prompt),
            url: addDefaultExtension(prompt),
        };
    }
    
    // Check if it's a local absolute path
    if (prompt.match(/^[a-zA-Z]:\\/) || prompt.startsWith('/')) {
        return {
            type: 'local',
            name: getPromptName(prompt),
            localPath: addDefaultExtension(prompt),
        };
    }
    
    // Check if it contains platform shorthand (has colon)
    if (prompt.includes(':')) {
        // Parse platform shorthand
        const name = getPromptName(prompt);
        prompt = addDefaultExtension(prompt);
        const [platform, ...rest] = prompt.split(':');

        if (!rest.length) {
            throw new Error('Invalid format. Use ado:org/project/repo/path or gh:owner/repo/path');
        }

        const fullPath = rest.join(':');
        
        if (platform === 'ado') {
            const parts = fullPath.split('/');
            if (parts.length < 4) {
                throw new Error('Invalid ADO format. Use ado:org/project/repo/path');
            }
            const [org, project, repo, ...pathParts] = parts;
            return {
                type: 'ado',
                name,
                org,
                project,
                repo,
                filePath: pathParts.join('/')
            };
        } else if (platform === 'gh') {
            const parts = fullPath.split('/');
            if (parts.length < 3) {
                throw new Error('Invalid GitHub format. Use gh:owner/repo/path');
            }
            const [owner, repo, ...pathParts] = parts;
            return {
                type: 'github',
                name,
                owner,
                repo,
                filePath: pathParts.join('/')
            };
        }
        
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    // Default: treat as an installed prompt name (VS Code slash commands)
    return {
        type: 'installed',
        name: prompt,
    };
}

/**
 * Gets the prompt name from any prompt parameter
 * @param prompt - The original prompt parameter (before extension is added)
 * @returns The prompt name (last part without file extension)
 */
export function getPromptName(prompt: string): string {
    // Get the last part after any slash (/, \, or :)
    const parts = prompt.split(/[/\\:]/);
    const lastPart = parts[parts.length - 1];
    
    // Handle .prompt.md extension specifically
    if (lastPart.endsWith('.prompt.md')) {
        return lastPart.replace('.prompt.md', '');
    }
    
    // Remove any single file extension
    return lastPart.replace(/\.[^.]*$/, '');
}

/**
 * Adds default file extension to a path if none is present
 * @param path - The file path to process
 * @returns The path with a default extension added if needed
 */
export function addDefaultExtension(path: string): string {
    const extensions = ['.prompt.md', '.md', '.txt', '.json'];
    const hasExtension = extensions.some(ext => path.endsWith(ext));
    return hasExtension ? path : path + '.prompt.md';
}

/**
 * Parses workspace parameter from URI to determine workspace handling
 * @param workspace - The workspace parameter string from URI (e.g., 'select' or 'select:message')
 * @returns Parsed workspace configuration object
 */
export function parseWorkspaceParameter(workspace: string): WorkspaceConfig {
    if (!workspace) {
        return { type: 'current' };
    }
    
    // Check if it starts with 'select'
    if (workspace === 'select') {
        return { type: 'select' };
    }
    
    if (workspace.startsWith('select:')) {
        const message = decodeURIComponent(workspace.substring(7)); // 7 = 'select:'.length
        return { type: 'select', message };
    }
    
    // Error for any other value
    throw new Error(`Invalid workspace type: ${workspace}. Use 'select' or 'select:message'`);
}
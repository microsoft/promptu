// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { McpServerConfig } from './types';

// VSCode internal server definition ID prefix for user-level mcp.json.
// Source: vscode/src/vs/workbench/services/mcp/common/mcpWorkbenchManagementService.ts
const SERVER_ID_PREFIX = 'mcp.config.usrlocal.';
const MAX_ATTEMPTS = 4;
const RETRY_INTERVAL_MS = 1000;

/**
 * Starts MCP servers in VSCode and waits for them to be ready.
 * Retries startServer calls to handle the delay between writing mcp.json
 * and VSCode registering the server internally (~1-2s).
 */
export async function ensureMcpServersStarted(
    servers: McpServerConfig[],
    outputChannel: vscode.OutputChannel
): Promise<void> {
    if (servers.length === 0) {
        return;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        for (const server of servers) {
            const serverId = `${SERVER_ID_PREFIX}${server.name}`;
            try {
                await vscode.commands.executeCommand(
                    'workbench.mcp.startServer',
                    serverId,
                    { waitForLiveTools: true }
                );
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`promptu: startServer error for '${server.name}': ${msg}`);
            }
        }

        if (attempt < MAX_ATTEMPTS) {
            outputChannel.appendLine(`promptu: MCP server start attempt ${attempt}/${MAX_ATTEMPTS}`);
            await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
        }
    }

    outputChannel.appendLine(`promptu: MCP server start sequence completed`);
}

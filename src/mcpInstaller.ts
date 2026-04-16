// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import * as jsonc from 'jsonc-parser';
import { McpServerConfig, McpConfiguration } from './types';
import { showMcpInstallationConfirmation } from './userDialogs';

/**
 * Result of an MCP server installation attempt
 */
type InstallResult = {
    cancelled: boolean;         // true = user cancelled, false = completed
    configModified: boolean;    // true = config needs to be written
};

/**
 * Handles MCP server installation and configuration
 */
export class McpInstaller {
    private outputChannel: vscode.OutputChannel;
    private mcpConfigPath: string;
    private context: vscode.ExtensionContext;

    constructor(outputChannel: vscode.OutputChannel, context: vscode.ExtensionContext) {
        this.outputChannel = outputChannel;
        this.context = context;
        // Get path to user's mcp.json file
        this.mcpConfigPath = this.getMcpConfigPath(context);
        
        // Log that we're using the correct VS Code path
        this.outputChannel.appendLine(`promptu: Using MCP config path: ${this.mcpConfigPath}`);
    }

    /**
     * Gets the VS Code User directory path using ExtensionContext
     * @param context VS Code extension context (required)
     */
    private getMcpConfigPath(context: vscode.ExtensionContext): string {

        try {
            // Use VS Code's globalStorageUri to find the User directory
            // globalStorageUri is typically: ~/.../Code/User/globalStorage/extension-id
            // We want: ~/.../Code/User/mcp.json
            const globalStoragePath = context.globalStorageUri.fsPath;
            const userDir = path.resolve(globalStoragePath, '..', '..');
            const mcpPath = path.join(userDir, 'mcp.json');
            
            this.outputChannel.appendLine(`promptu: Using VS Code API path: ${mcpPath}`);
            this.outputChannel.appendLine(`promptu: Derived from globalStorageUri: ${globalStoragePath}`);
            return mcpPath;
            
        } catch (error) {
            throw new Error(`Failed to determine MCP config path from VS Code API: ${error}`);
        }
    }

    /**
     * Installs and configures MCP servers from URI parameter
     * @param servers Array of MCP server configurations to install
     * @returns Promise<boolean> - true if all servers installed, false if user cancelled
     */
    async installServers(servers: McpServerConfig[]): Promise<boolean> {
        this.outputChannel.appendLine(`promptu: Installing ${servers.length} MCP server(s)`);

        // Read mcp config, create a new one if it doesn't exist.
        let config = await this.readMcpConfig() || { servers: {}, inputs: [] };
        let needsConfigWrite = false;

        for (const server of servers) {
            try {    
                let result: InstallResult;
                
                if (server.nugetPackage) {
                    result = await this.installNuGetForServer(server, config);
                } else {
                    result = await this.installServerConfig(server, config);
                }

                if (result.cancelled) {
                    this.outputChannel.appendLine(`promptu: User cancelled installation of MCP server: ${server.name}`);
                    return false;
                }
                
                if (result.configModified) {
                    needsConfigWrite = true;
                }
            } catch (error) {
                const message = `Failed to install MCP server '${server.name}': ${error instanceof Error ? error.message : 'Unknown error'}`;
                this.outputChannel.appendLine(`promptu: ${message}`);
                throw new Error(message);
            }
        }

        // Write config once at the end if needed
        if (needsConfigWrite) {
            await this.writeMcpConfig(config);
        }

        return true;
    }

    /**
     * Installs a NuGet-based MCP server
     * @param server MCP server configuration with NuGet details
     * @param config MCP configuration object to modify
     * @returns Promise<InstallResult> - result with cancellation and config modification status
     */
    private async installNuGetForServer(server: McpServerConfig, config: McpConfiguration): Promise<InstallResult> {
        if (!server.nugetPackage) {
            throw new Error('NuGet server configuration requires nugetPackage property');
        }

        this.outputChannel.appendLine(`promptu: Installing NuGet package '${server.nugetPackage}' and '${server.version}'...`);

        // Check if server is already configured in mcp.json
        const isConfigured = config !== null && server.name in config.servers;
        if (isConfigured) {
            this.outputChannel.appendLine(`promptu: Server '${server.name}' already configured in mcp.json`);
        }

        // Check if package is already installed
        let isNuGetInstalled = false;
        const toolInfo = await this.getDotnetToolInfo(server.nugetPackage);
        const installedVersion = toolInfo?.version ?? null;
        if (installedVersion) {
            if (server.version) {
                if (this.isVersionSufficient(installedVersion, server.version)) {
                    this.outputChannel.appendLine(`promptu: NuGet package '${server.nugetPackage}' already installed with sufficient version (${installedVersion})`);
                    isNuGetInstalled = true;
                } else {
                    this.outputChannel.appendLine(`promptu: NuGet package '${server.nugetPackage}' version ${installedVersion} insufficient (need ${server.version})`);
                }
            } else {
                // No version specified - any installed version is sufficient
                this.outputChannel.appendLine(`promptu: NuGet package '${server.nugetPackage}' already installed (version ${installedVersion})`);
                isNuGetInstalled = true;
            }
        }

        // If both NuGet package is installed and config exists, nothing to do
        if (isNuGetInstalled && isConfigured) {
            return { cancelled: false, configModified: false };
        }

        // If NuGet is installed but config is missing, prompt before adding to config
        if (isNuGetInstalled && !isConfigured) {
            const shouldConfigure = await showMcpInstallationConfirmation(server);
            if (!shouldConfigure) {
                return { cancelled: true, configModified: false };
            }
            this.outputChannel.appendLine(`promptu: NuGet package already installed, adding server '${server.name}' to mcp.json`);
            this.addServerToConfig(config, server);
            return { cancelled: false, configModified: true };
        }

        // Ask user for permission with detailed information
        // Pass installedVersion so the dialog can show update-specific messaging
        const needsUpdate = installedVersion !== null && !isNuGetInstalled;
        const shouldInstall = await showMcpInstallationConfirmation(server, needsUpdate ? installedVersion : undefined);
        if (!shouldInstall) {
            return { cancelled: true, configModified: false }; // User cancelled
        }

        // Install NuGet package, passing existing tool info to avoid redundant query
        await this.installNuGetGlobalTool(server, toolInfo);
        this.outputChannel.appendLine(`promptu: NuGet package installed successfully`);

        // Add to mcp.json config
        this.addServerToConfig(config, server);

        return { cancelled: false, configModified: true };
    }

    /**
     * Adds a server configuration to mcp.json (for config-only servers)
     * @param server MCP server configuration to add
     * @param config MCP configuration object to modify
     * @returns Promise<InstallResult> - result with cancellation and config modification status
     */
    private async installServerConfig(server: McpServerConfig, config: McpConfiguration): Promise<InstallResult> {
        // Check if already configured
        if (config !== null && server.name in config.servers) {
            this.outputChannel.appendLine(`promptu: Server '${server.name}' already configured in mcp.json`);
            return { cancelled: false, configModified: false }; // Already configured
        }

        // Ask user for permission with detailed information
        const shouldInstall = await showMcpInstallationConfirmation(server);
        if (!shouldInstall) {
            return { cancelled: true, configModified: false }; // User cancelled
        }

        // Add the server configuration
        this.addServerToConfig(config, server);
        return { cancelled: false, configModified: true };
    }

    /**
     * Helper function to add a server configuration to mcp configuration object
     * @param config - MCP configuration object to modify
     * @param server - MCP server configuration to add
     */
    private addServerToConfig(config: McpConfiguration, server: McpServerConfig): void {
        // Add the server configuration
        config.servers[server.name] = {
            type: server.type,
            ...(server.command && { command: server.command }),
            ...(server.args && { args: server.args }),
            ...(server.url && { url: server.url }),
            ...(server.env && { env: server.env })
        };

        this.outputChannel.appendLine(`promptu: Added ${server.name} to config (in memory)`);
    }

    /**
     * Compares two version strings to determine if installed version is sufficient
     * @param installed - Currently installed version
     * @param required - Required minimum version
     * @returns boolean - true if installed version meets requirements
     */
    private isVersionSufficient(installed: string, required: string): boolean {
        // Clean versions by removing pre-release and build metadata for main comparison
        const cleanInstalled = installed.split('-')[0].split('+')[0];
        const cleanRequired = required.split('-')[0].split('+')[0];
        
        // Split by dots and convert to numbers, handling invalid parts gracefully
        const installedParts = cleanInstalled.split('.').map(part => {
            const num = parseInt(part, 10);
            return isNaN(num) ? 0 : num;
        });
        const requiredParts = cleanRequired.split('.').map(part => {
            const num = parseInt(part, 10);
            return isNaN(num) ? 0 : num;
        });
        
        // Pad arrays to same length
        const maxLength = Math.max(installedParts.length, requiredParts.length);
        while (installedParts.length < maxLength) {
            installedParts.push(0);
        }
        while (requiredParts.length < maxLength) {
            requiredParts.push(0);
        }
        
        // Compare each part
        for (let i = 0; i < maxLength; i++) {
            if (installedParts[i] > requiredParts[i]) {
                return true; // Installed version is higher
            } else if (installedParts[i] < requiredParts[i]) {
                return false; // Installed version is lower
            }
            // Continue if equal
        }
        
        // If core versions are equal, handle pre-release comparison
        // Rule: 1.0.0 > 1.0.0-alpha (release > pre-release)
        const installedHasPrerelease = installed.includes('-');
        const requiredHasPrerelease = required.includes('-');
        
        if (!installedHasPrerelease && requiredHasPrerelease) {
            return true; // Release version satisfies pre-release requirement
        } else if (installedHasPrerelease && !requiredHasPrerelease) {
            return false; // Pre-release doesn't satisfy release requirement
        }
        
        return true; // Versions are equal or both pre-release
    }

    /**
     * Reads the current mcp.json configuration, returns null if file doesn't exist
     */
    async readMcpConfig(): Promise<McpConfiguration | null> {
        const configUri = vscode.Uri.file(this.mcpConfigPath);
        
        try {
            const fileData = await vscode.workspace.fs.readFile(configUri);
            const content = Buffer.from(fileData).toString('utf8');
            
            // Use jsonc-parser which tolerates trailing commas and comments
            const errors: jsonc.ParseError[] = [];
            const parsed = jsonc.parse(content, errors, { allowTrailingComma: true });
            
            // Check for parse errors
            if (errors.length > 0) {
                const firstError = errors[0];
                const position = this.getLineAndColumn(content, firstError.offset);
                const errorType = jsonc.printParseErrorCode(firstError.error);
                
                // Show user-friendly error with option to open file
                const openFile = 'Open mcp.json';
                const message = `Your mcp.json has a syntax error on line ${position.line}, column ${position.column}: ${errorType}`;
                
                this.outputChannel.appendLine(`promptu: ${message}`);
                
                vscode.window.showErrorMessage(message, openFile).then(selection => {
                    if (selection === openFile) {
                        vscode.window.showTextDocument(configUri, {
                            selection: new vscode.Range(position.line - 1, position.column - 1, position.line - 1, position.column - 1)
                        });
                    }
                });
                
                throw new Error(message);
            }
            
            // Handle unexpected structure - alert user and stop to prevent data loss
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                const openFile = 'Open mcp.json';
                const message = 'Your mcp.json has an unexpected structure (expected an object with "servers" property)';
                
                this.outputChannel.appendLine(`promptu: ${message}`);
                
                vscode.window.showErrorMessage(message, openFile).then(selection => {
                    if (selection === openFile) {
                        vscode.window.showTextDocument(configUri);
                    }
                });
                
                throw new Error(message);
            }
            
            // Ensure servers object exists
            if (!parsed.servers || typeof parsed.servers !== 'object') {
                parsed.servers = {};
            }
            
            return parsed as McpConfiguration;
        } catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                return null; // File doesn't exist
            }
            throw error;
        }
    }

    /**
     * Converts a character offset to line and column numbers
     */
    private getLineAndColumn(content: string, offset: number): { line: number; column: number } {
        const lines = content.substring(0, offset).split('\n');
        return {
            line: lines.length,
            column: lines[lines.length - 1].length + 1
        };
    }

    /**
     * Gets MCP servers as an array of McpServerConfig objects
     */
    async getMcpServers(): Promise<McpServerConfig[]> {
        const config = await this.readMcpConfig();
        if (!config) {
            return []; // No config file means no servers
        }
        return Object.entries(config.servers || {}).map(([name, serverConfig]) => ({
            name,
            ...serverConfig
        }));
    }

    /**
     * Writes the mcp.json configuration
     */
    private async writeMcpConfig(config: McpConfiguration): Promise<void> {
        const configUri = vscode.Uri.file(this.mcpConfigPath);
        const dirUri = vscode.Uri.file(path.dirname(this.mcpConfigPath));
        
        // Ensure directory exists
        await vscode.workspace.fs.createDirectory(dirUri);

        const content = JSON.stringify(config, null, 2);
        const contentBuffer = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(configUri, contentBuffer);
    }

    /**
     * Executes a dotnet command and returns the result
     */
    private async executeDotnetCommand(args: string[]): Promise<{exitCode: number, stdout: string, stderr: string}> {
        const commandLine = `dotnet ${args.join(' ')}`;
        this.outputChannel.appendLine(`promptu: Running: ${commandLine}`);
        
        return new Promise((resolve) => {
            const process = spawn('dotnet', args);
            
            let stdout = '';
            let stderr = '';

            process.stdout?.on('data', (data) => stdout += data.toString());
            process.stderr?.on('data', (data) => stderr += data.toString());

            process.on('close', (exitCode) => {
                resolve({ exitCode: exitCode || 0, stdout, stderr });
            });

            process.on('error', (error) => {
                resolve({ exitCode: 1, stdout, stderr: error.message });
            });
        });
    }

    /**
     * Installs or updates a NuGet global tool
     * @param server - MCP server configuration with NuGet details
     * @param existingToolInfo - Pre-fetched tool info if available (avoids redundant dotnet tool list call)
     */
    private async installNuGetGlobalTool(server: McpServerConfig, existingToolInfo?: {version: string; commandName: string} | null): Promise<void> {
        if (!server.nugetPackage) {
            throw new Error('NuGet package name is required for installation');
        }

        const packageName = server.nugetPackage; // Store to help TypeScript understand it's defined

        // Use pre-fetched info if available, otherwise query
        const toolInfo = existingToolInfo !== undefined ? existingToolInfo : await this.getDotnetToolInfo(packageName);
        const isUpdate = toolInfo !== null;

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `promptu: ${isUpdate ? 'Updating' : 'Installing'} ${server.name}`,
            cancellable: false
        }, async (progress) => {
            const action = isUpdate ? 'update' : 'install';
            progress.report({ message: `Preparing dotnet tool ${action}` });

            // If updating, kill any running processes that may hold file locks
            if (isUpdate && toolInfo?.commandName) {
                await this.stopRunningTool(toolInfo.commandName);
            }

            // Build command args -- use 'update' if already installed, 'install' if not
            const installArgs: string[] = ['tool', action, '--global', packageName];
            
            // Add custom feed if specified
            if (server.nugetFeed) {
                installArgs.push('--add-source', server.nugetFeed);
                // Add interactive flag for authentication to private feeds
                installArgs.push('--interactive');
                // Ignore failed sources to avoid errors from other configured feeds
                installArgs.push('--ignore-failed-sources');
                this.outputChannel.appendLine(`promptu: Using custom NuGet feed: ${server.nugetFeed}`);
            }
            
            // Add version if specified
            if (server.version) {
                installArgs.push('--version', server.version);
            }

            progress.report({ message: `Running dotnet tool ${action}` });
            const result = await this.executeDotnetCommand(installArgs);

            if (result.exitCode !== 0) {
                throw new Error(`dotnet tool ${action} failed: ${result.stderr}`);
            }

            this.outputChannel.appendLine(`promptu: NuGet package ${isUpdate ? 'updated' : 'installed'} successfully`);
        });
    }

    /**
     * Gets info about an installed dotnet global tool.
     * @param packageName - The NuGet package name
     * @returns Tool info with version and command name, or null if not installed
     */
    private async getDotnetToolInfo(packageName: string): Promise<{version: string; commandName: string} | null> {
        this.outputChannel.appendLine(`promptu: Checking version for NuGet package: ${packageName}`);
        
        try {
            const result = await this.executeDotnetCommand(['tool', 'list', '--global', packageName]);
            
            this.outputChannel.appendLine(`promptu: dotnet tool list stdout:\n${result.stdout}`);

            const info = parseDotnetToolListOutput(result.stdout);
            if (info) {
                this.outputChannel.appendLine(`promptu: Package ${packageName} is installed with version: ${info.version}, command: ${info.commandName}`);
            } else {
                this.outputChannel.appendLine(`promptu: Package ${packageName} is not installed, or version was not found.`);
            }
            return info;
        } catch (error) {
            this.outputChannel.appendLine(`promptu: Error checking NuGet package version: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    /**
     * Attempts to stop a running dotnet tool process to release file locks.
     * Windows-only -- file locking is not an issue on macOS/Linux.
     * @param commandName - The tool's command name (from dotnet tool list)
     */
    private async stopRunningTool(commandName: string): Promise<void> {
        if (process.platform !== 'win32') {
            return; // File locking is Windows-only
        }

        // Sanitize: only allow alphanumeric, hyphens, dots, underscores
        if (!/^[a-zA-Z0-9._-]+$/.test(commandName)) {
            this.outputChannel.appendLine(`promptu: Process name '${commandName}' contains unexpected characters, skipping process kill`);
            return;
        }

        try {
            this.outputChannel.appendLine(`promptu: Stopping running process: ${commandName}`);
            const killResult = await new Promise<{exitCode: number, stdout: string, stderr: string}>((resolve) => {
                const proc = spawn('taskkill', ['/IM', `${commandName}.exe`], { shell: false });
                let stdout = '';
                let stderr = '';
                proc.stdout?.on('data', (data) => stdout += data.toString());
                proc.stderr?.on('data', (data) => stderr += data.toString());
                proc.on('close', (exitCode) => resolve({ exitCode: exitCode || 0, stdout, stderr }));
                proc.on('error', (error) => resolve({ exitCode: 1, stdout, stderr: error.message }));
            });

            if (killResult.stdout.includes('SUCCESS')) {
                this.outputChannel.appendLine(`promptu: Stopped process '${commandName}'`);
            } else {
                this.outputChannel.appendLine(`promptu: Process '${commandName}' is not currently running`);
            }
        } catch (e) {
            this.outputChannel.appendLine(`promptu: Could not stop running tool process: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }

    /**
     * Parses MCP configuration from URI parameter
     * Handles multiple levels of URL encoding (e.g., from SafeLinks, redirects)
     */
    parseMcpParameter(mcpParam: string): McpServerConfig[] {
        const parsed = this.decodeAndParseJson(mcpParam);
        return this.validateMcpServers(parsed);
    }

    /**
     * Decodes URL-encoded input iteratively and parses as JSON
     * Handles single, double, or triple+ URL encoding from redirects/SafeLinks
     * @param input - Potentially URL-encoded JSON string
     * @returns Parsed JSON value
     * @throws Error if JSON cannot be parsed after all decode attempts
     */
    private decodeAndParseJson(input: string): unknown {
        let decoded = input;
        
        for (let i = 0; i < 5; i++) { // Max 5 iterations to prevent infinite loops
            try {
                return JSON.parse(decoded);
            } catch {
                // JSON parse failed, try decoding one more level
                try {
                    const next = decodeURIComponent(decoded);
                    if (next === decoded) {
                        break; // No change after decode, can't decode further
                    }
                    decoded = next;
                } catch {
                    break; // Decode failed (malformed encoding), stop trying
                }
            }
        }
        
        throw new Error(`mcp parameter: must be valid JSON. Example: {"name":"MyServer","type":"http","url":"https://example.com/mcp"}`);
    }

    /**
     * Validates parsed JSON as MCP server configuration(s)
     * @param parsed - Parsed JSON value to validate
     * @returns Array of validated MCP server configurations
     * @throws Error if validation fails
     */
    private validateMcpServers(parsed: unknown): McpServerConfig[] {
        // Validate that parsed JSON is either an object or array
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('mcp parameter: must be an object or array');
        }
        
        // Handle single server object or array of servers
        const servers = Array.isArray(parsed) ? parsed : [parsed];
        
        // Validate required fields
        for (const server of servers) {
            if (!server.name || typeof server.name !== 'string') {
                throw new Error('mcp parameter: server missing required "name" field');
            }
            if (!server.type || (server.type !== 'stdio' && server.type !== 'http')) {
                throw new Error(`mcp parameter: server '${server.name}' has invalid "type" (must be "stdio" or "http")`);
            }
        }
        
        return servers as McpServerConfig[];
    }
}

/**
 * Parses the stdout of `dotnet tool list --global` to extract tool version and command name.
 * @param stdout - The raw stdout string from `dotnet tool list`
 * @returns Object with version and commandName, or null if not found
 */
export function parseDotnetToolListOutput(stdout: string): {version: string; commandName: string} | null {
    const lines = stdout.trim().split('\n');
    if (lines.length < 3) {
        return null;
    }
    const parts = lines[2].trim().split(/\s+/);
    if (parts.length < 3) {
        return null;
    }
    return { version: parts[1], commandName: parts[2] };
}
# promptu VSCode Extension

Create shareable, clickable links that run AI prompts from anywhere directly in VSCode's Github Copilot Chat.

Try now! [![Run in VS Code](https://img.shields.io/badge/VS_Code_%7C_promptu-Welcome-0098FF?style=flat-square&logo=githubcopilot&logoColor=white)](https://vscode.dev/redirect?url=vscode://ms-promptu.promptu?prompt=https://raw.githubusercontent.com/microsoft/promptu/refs/heads/main/.github/prompts/welcome.prompt.md&windowId=_blank) [![Run in VS Code](https://img.shields.io/badge/VS_Code_Insiders_%7C_promptu-Welcome-24bfa5?style=flat-square&logo=githubcopilot&logoColor=white)](https://vscode.dev/redirect?url=vscode-insiders://ms-promptu.promptu?prompt=https://raw.githubusercontent.com/microsoft/promptu/refs/heads/main/.github/prompts/welcome.prompt.md&windowId=_blank)

## Features

- **🔗 Prompts In A Click**: Transform any prompt into a shareable, clickable link
- **🌐 Universal Prompt Access**: Support for Azure DevOps, GitHub, direct URLs, local files, and MCP prompts
- **💬 GitHub Copilot Integration**: Executes prompts directly in Copilot Chat
- **🛠️ MCP Server Support**: Specify Model Context Protocol servers to install for prompts

## URI Format

Prompt + Input + MCPs + Workspace

```
vscode://ms-promptu.promptu?prompt=<prompt-location>&input=<input-data>&mcp=<mcp-config>&workspace=<workspace-config>
```

For VSCode Insiders, use `vscode-insiders://`

**Parameters:**
- `prompt` *(required)*: Location of the prompt, see [Supported Prompt Sources](#supported-prompt-sources)
- `input` *(optional)*: Any string to pass to the prompt. For specifying MCP prompt arguments, see [MCP Prompt Inputs](#mcp-prompt-inputs)
- `mcp` *(optional)*: MCP server configurations, see [MCP Server Configuration](#mcp-server-configuration)
- `workspace` *(optional)*: Workspace selection options, see [Workspace Selection](#workspace-selection)

Prepend `https://vscode.dev/redirect?url=` for creating clickable links

Append `&windowId=_blank` to open in a new VS Code window

## Supported Prompt Sources

| Source | Format | Example |
|--------|--------|---------|
| **GitHub** | `gh:<username>/<repo>/<path>` | `gh:awesome-team/ai-prompts/code-review` |
| **Azure DevOps** | `ado:<org>/<project>/<repo>/<path>` | `ado:company/engineering/ai-assistants/code-quality` |
| **Direct URL** | `https://...` | `https://raw.githubusercontent.com/team/ai-prompts/main/analysis` |
| **Local File** | Absolute path | `C:/my-prompts/code-review` (Windows)<br>`/home/user/my-prompts/debug-helper` (Linux/Mac) |
| **Installed Prompts** | `<prompt name>` | `code-review` |
| **MCP Prompts** | `mcp.<MCP server name>.<prompt name>` | `mcp.MyMCPServer.MyPrompt` |

For file-based prompts, automatically adds `.prompt.md` extension if no extension provided. 

## How to use

Simply enter the URI into your browser address bar or file explorer.

Or create clickable links by prepending `https://vscode.dev/redirect?url=`

Ex: https://vscode.dev/redirect?url=vscode://ms-promptu.promptu?prompt=gh:github/awesome-copilot/prompts/prompt-builder

Or create buttons, ex:

[![Run in VS Code](https://img.shields.io/badge/VS_Code_%7C_promptu-Prompt_Name-0098FF?style=flat-square&logo=githubcopilot&logoColor=white)](https://vscode.dev/redirect?url=vscode://ms-promptu.promptu?prompt=gh:github/awesome-copilot/prompts/prompt-builder) 

[![Run in VS Code](https://img.shields.io/badge/VS_Code_Insiders_%7C_promptu-Prompt_Name-24bfa5?style=flat-square&logo=githubcopilot&logoColor=white)](https://vscode.dev/redirect?url=vscode-insiders://ms-promptu.promptu?prompt=gh:github/awesome-copilot/prompts/prompt-builder)

Or use platform-specific shortcuts
- **Windows**: `Win+R` → paste URI → Enter
- **Mac**: `Cmd+Space` → paste URI → Enter

## Authentication
If prompt is publicly available, no auth needed.

If not, uses MSAL authentication for Azure DevOps, or git authentication. Works automatically if you can `git clone` the repository. [Git Credential Manager](https://github.com/git-ecosystem/git-credential-manager) is recommended for setting up git credentials.

## Requirements

- **VSCode**: 1.103.0 or higher
- **GitHub Copilot Chat**: Extension must be installed and configured

For private sources:
- **Git Credential Manager**: Required for private repository access. [Setup here](https://github.com/git-ecosystem/git-credential-manager)
- **Azure Artifacts Credential Provider**: Used to install MCPs from NuGet packages. [Setup here](https://github.com/microsoft/artifacts-credprovider)

## Installation
**Automatic:** VS Code will automatically ask to install the extension when running any promptu URI.

**Manual:** Install the extension from VS Code Marketplace by searching 'promptu' or build and install VSIX file.

## MCP Prompt Inputs
For MCP prompts, use JSON format to specify argument names and values:
```
&input={"argumentName": "value"}
&input={"arg1": "value1", "arg2": 123}  # Multiple arguments
```

## MCP Server Configuration

**NOTE**: This is tested as working for local MCPs via NuGet and remote MCPs. If using an MCP prompt, currently both unauthenticated access and Microsoft authentication are supported. Further MCP support is in development.

The `mcp` parameter configures Model Context Protocol servers needed for prompt execution. Supports single server object or array of servers:

**Single Server:**
```
&mcp={"name":"MyServer","type":"http","url":"https://api.example.com/mcp"}
```

**Multiple Servers:**
```
&mcp=[{"name":"Server1","type":"http","url":"..."},{"name":"Server2","type":"stdio","command":"..."}]
```

**MCP Config:**
```javascript
{
  "name": "string",           // Required: Unique identifier for the MCP server
  "type": "http|stdio",       // Required: Transport protocol type
  "url": "string",            // For HTTP: Server endpoint URL
  "command": "string",        // For stdio: Executable command/tool name
  "nugetPackage": "string",   // For NuGet: package to install (optional)
  "nugetFeed": "string",      // For NuGet: Custom NuGet feed URL (optional)
  "prerelease": boolean       // For NuGet: Include prerelease packages (optional, defaults to false)
}
```

**Server Types:**
- **HTTP**: `{"name":"MyServer","type":"http","url":"https://api.example.com/mcp"}`
- **stdio**: `{"name":"MyServer","type":"stdio","command":"my-mcp-tool"}`
- **NuGet Package**: `{"name":"MyServer","type":"stdio","command":"my-mcp-tool","nugetPackage":"My.Package","nugetFeed":"https://api.nuget.org/v3/index.json","prerelease":false}`

**Examples:**
```
# HTTP MCP server
&mcp={"name":"microsoft.docs.mcp","type":"http","url":"https://learn.microsoft.com/api/mcp"}

# Local MCP via NuGet
&mcp={"name":"MyMCPServer","type":"stdio","command":"my-mcp-tool","nugetPackage":"My.Company.MCPServer","nugetFeed":"https://api.nuget.org/v3/index.json","prerelease":false}
```

**NOTE**: For clickable links (using `https://vscode.dev/redirect?url=`), JSON parameters must be stringified and URL-encoded. Asking Copilot to do this for you should work. You can also use `JSON.stringify()` followed by `encodeURIComponent()` in JavaScript, or equivalent functions in other languages.*

## Workspace Selection

The `workspace` parameter allows you to specify which workspace context the prompt should run in:

**Format:**
```
workspace=select                    # Show workspace selection dialog
workspace=select:Custom message     # Show dialog with custom guidance message
```

**Selection Options:**
- **Current Workspace**: Execute in the currently open workspace
- **Browse for Folder**: Choose a different folder/workspace to open in a new window
- **Execute without workspace context**: Run the prompt without specific workspace context

**Examples:**
```bash
# Simple workspace selection
vscode://ms-promptu.promptu?prompt=gh:team/prompts/code-review&workspace=select

# With custom guidance message
vscode://ms-promptu.promptu?prompt=gh:team/prompts/debug-react&workspace=select:This%20debugging%20prompt%20works%20best%20in%20a%20React%20project%20workspace
```

When a different workspace is selected, promptu will:
1. Open the selected workspace in a new VS Code window
2. Re-execute the prompt in that new workspace context
3. The original window remains unchanged

## Complete URI Examples

**Using GitHub shorthand:**
For this prompt from awesome-copilot repo: [prompt-builder](https://github.com/github/awesome-copilot/blob/main/prompts/prompt-builder.prompt.md)

Github: `vscode://ms-promptu.promptu?prompt=gh:github/awesome-copilot/prompts/prompt-builder`

**Using direct raw URL:**
`vscode://ms-promptu.promptu?prompt=https://raw.githubusercontent.com/github/awesome-copilot/refs/heads/main/prompts/prompt-builder.prompt.md`

**Using a prompt name** (for prompts already in your VS Code):
`vscode://ms-promptu.promptu?prompt=code-review&input=Review this TypeScript function`

**Using MCP prompt with server auto-configuration:**
`vscode://ms-promptu.promptu?prompt=mcp.MyMCPServer.MyPrompt&input={"dataId":"12345"}&mcp={"name":"MyMCPServer","type":"stdio","command":"my-mcp-tool","nugetPackage":"My.Company.MCPServer","nugetFeed":"https://api.nuget.org/v3/index.json","prerelease":false}`

**Using workspace selection:**
`vscode://ms-promptu.promptu?prompt=gh:team/react-prompts/debug-component&workspace=select:This%20prompt%20needs%20a%20React%20project%20workspace`


## Development

```bash
npm install
npm run compile
npm run package
```

## Commands

The extension provides these commands via the Command Palette (`Ctrl+Shift+P`):

- **promptu: Execute Prompt** - Manually execute a prompt by entering the prompt location and input

**Troubleshooting commands** (only needed if VS Code updates break Copilot Chat integration):
- **promptu: Set Copilot Chat Command** - Manually override the chat command 
- **promptu: Discover Available Chat Commands** - Browse available chat commands

*Note: The extension auto-detects working commands. Only use troubleshooting commands if prompts fail to open in Copilot Chat.*

## License

MIT

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit [Contributor License Agreements](https://cla.opensource.microsoft.com).

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.

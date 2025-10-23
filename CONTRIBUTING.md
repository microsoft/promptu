# Contributing to promptu

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Getting Started

### Prerequisites
- Node.js 18.x or 20.x
- VS Code 1.103.0 or higher
- GitHub Copilot Chat extension

### Development Setup

1. Fork the repository
2. Clone your fork locally
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the extension:
   ```bash
   npm run compile
   ```
5. Run tests:
   ```bash
   npm test
   ```
6. Package the extension (optional):
   ```bash
   npm run vsce:package
   ```

### Making Changes

1. Create a new branch for your feature/fix
2. Make your changes
3. Add/update tests as needed
4. Run the build to check for compilation errors:
   ```bash
   npm run compile
   ```
5. Run linting:
   ```bash
   npm run lint
   ```
6. Run tests to ensure everything works:
   ```bash
   npm test
   ```
7. Commit your changes with a descriptive message
8. Push to your fork and create a pull request

### Development Workflow

For active development, you can use watch mode to automatically recompile on changes:
```bash
npm run watch
```

### Testing Your Changes

1. Press F5 in VS Code to launch a new Extension Development Host window
2. Test your changes in the new VS Code window
3. Verify the extension loads and functions correctly

### Code Style

This project uses ESLint for code formatting and style. Please ensure your code passes linting before submitting a PR.

### Submitting Pull Requests

1. Provide a clear description of the problem and solution
2. Include relevant issue numbers if applicable
3. Add appropriate tests for new functionality
4. Ensure CI checks pass
5. Be prepared to address feedback during code review

## Reporting Issues

Please use the GitHub issue tracker to report bugs or request features. When reporting bugs, include:

- VS Code version
- Extension version
- Steps to reproduce the issue
- Expected vs actual behavior
- Any relevant log output

## Community

- Ask questions and get help in [GitHub Discussions](https://github.com/microsoft/promptu/discussions)
- Follow project updates and announcements

Thank you for contributing to promptu!
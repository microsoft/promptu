import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/**/*.test.js',
    workspaceFolder: './test-workspace',
    mocha: {
        ui: 'tdd',
        color: true,
        timeout: 20000
    }
});
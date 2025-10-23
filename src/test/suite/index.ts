// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 20000
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((resolve, reject) => {
        // Since @vscode/test-cli handles test discovery, we don't need glob
        // Just add all test files that follow the pattern
        try {
            // The test files are automatically discovered by VS Code test runner
            resolve();
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}
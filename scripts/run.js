#!/usr/bin/env node
/**
 * Cross-platform launcher for deploy and dev scripts.
 * Usage: node scripts/run.js <deploy|dev> [options]
 */

import { logConsole } from '../backend/src/utils/logger.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [, , command, ...args] = process.argv;

if (!command || (command !== 'deploy' && command !== 'dev')) {
  logConsole('error', 'Usage: node scripts/run.js <deploy|dev>');
  process.exit(1);
}

if (command === 'deploy' && args.some(arg => arg === '--help' || arg === '-h')) {
  logConsole('log', 'Usage: npm run deploy -- [--reinstall | --reinstall-npm]');
  process.exit(0);
}
if (command === 'deploy' && args.some(arg => !['--reinstall', '--reinstall-npm'].includes(arg))) {
  logConsole('error', 'Unknown deployment option. Run npm run deploy -- --help for usage.');
  process.exit(1);
}

const isWindows = os.platform() === 'win32';
const scriptPrefix = command === 'dev' ? 'start-dev' : command;
const scriptName = isWindows ? `${scriptPrefix}.ps1` : `${scriptPrefix}.sh`;
const scriptPath = path.join(__dirname, scriptName);

logConsole('log', `Platform: ${os.platform()}`);
logConsole('log', `Running: ${scriptPath}`);

let child;
if (isWindows) {
  const switches = command === 'deploy' && args.length ? ['-Reinstall'] : [];
  child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...switches], {
    stdio: 'inherit'
  });
} else {
  child = spawn('bash', [scriptPath, ...(command === 'deploy' ? args : [])], {
    stdio: 'inherit'
  });
}

child.on('error', error => {
  logConsole('error', error.message);
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});

#!/usr/bin/env node
/**
 * Cross-platform launcher for deploy and dev scripts.
 * Usage: node scripts/run.js <deploy|dev>
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const command = process.argv[2];

if (!command || (command !== 'deploy' && command !== 'dev')) {
  console.error('Usage: node scripts/run.js <deploy|dev>');
  process.exit(1);
}

const isWindows = os.platform() === 'win32';
const scriptName = isWindows ? `${command}.ps1` : `${command}.sh`;
const scriptPath = path.join(__dirname, scriptName);

console.log(`Platform: ${os.platform()}`);
console.log(`Running: ${scriptPath}`);

let child;
if (isWindows) {
  child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    stdio: 'inherit'
  });
} else {
  child = spawn('bash', [scriptPath], {
    stdio: 'inherit'
  });
}

child.on('exit', (code) => {
  process.exit(code || 0);
});

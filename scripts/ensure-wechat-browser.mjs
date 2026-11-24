import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import '../backend/src/config.js';

const systemChrome = '/usr/bin/google-chrome';
const executable = process.env.WECHAT_BROWSER_EXECUTABLE ||
  (existsSync(systemChrome) ? systemChrome : undefined);

if (executable) {
  try {
    accessSync(executable, constants.X_OK);
    console.log(`  WeChat browser ready: ${executable}`);
  } catch (error) {
    console.error(`  Cannot use WeChat browser: ${error.message}`);
    process.exitCode = 1;
  }
} else {
  const cli = resolve('node_modules', 'playwright', 'cli.js');
  const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
    stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}

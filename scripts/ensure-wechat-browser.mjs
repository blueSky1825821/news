import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../backend/src/config.js';
import { getWechatBrowserExecutable, launchWechatBrowser } from '../backend/src/services/wechatBrowser.js';

try {
  const executable = getWechatBrowserExecutable();
  if (process.argv.includes('--check')) {
    const browser = await launchWechatBrowser();
    await browser.close();
    console.log('  WeChat browser launch check passed.');
  } else if (executable) {
    console.log(`  WeChat browser ready: ${executable}`);
  } else {
    const cli = fileURLToPath(new URL('../backend/node_modules/playwright/cli.js', import.meta.url));
    const result = spawnSync(process.execPath, [cli, 'install', '--only-shell', 'chromium'], {
      cwd: fileURLToPath(new URL('../backend/', import.meta.url)),
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`  Cannot prepare WeChat browser: ${error.message}`);
  process.exitCode = 1;
}

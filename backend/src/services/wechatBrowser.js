import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

export async function launchWechatBrowser() {
  if (process.platform === 'linux' && process.geteuid?.() === 0) {
    throw Object.assign(new Error('Chromium sandbox requires a non-root backend user on Linux'), {
      code: 'WECHAT_BROWSER_ROOT'
    });
  }
  return chromium.launch({
    executablePath: getWechatBrowserExecutable(),
    chromiumSandbox: true,
    timeout: 15_000
  });
}

export function getWechatBrowserExecutable() {
  const configured = process.env.WECHAT_BROWSER_EXECUTABLE;
  if (configured) {
    accessSync(configured, constants.X_OK);
    return configured;
  }

  const candidates = process.platform === 'win32'
    ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
        .filter(Boolean)
        .map(dir => join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    : ['/usr/bin/google-chrome'];

  return candidates.find(candidate => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

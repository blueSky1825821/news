import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

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

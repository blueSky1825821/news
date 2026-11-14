import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export const configPath = fileURLToPath(new URL('../.env', import.meta.url));

export function loadConfig(filePath = configPath) {
  try {
    // Existing process environment variables take precedence over the file.
    loadEnvFile(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

// Keep local credentials out of the test environment.
if (process.env.NODE_ENV !== 'test') loadConfig();

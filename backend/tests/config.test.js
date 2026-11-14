import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { configPath, loadConfig } from '../src/config.js';

describe('Backend configuration file', () => {
  let directory;
  const key = 'NEWS_CONFIG_TEST_VALUE';
  function loadInNode(filePath) {
    // Node's native environment loader updates the real environment, whereas
    // Jest supplies a separate process.env object. Verify in a real Node process.
    const moduleUrl = new URL('../src/config.js', import.meta.url).href;
    const code = `import { loadConfig } from ${JSON.stringify(moduleUrl)};
      const loaded = loadConfig(${JSON.stringify(filePath)});
      console.log(JSON.stringify({ loaded, value: process.env.${key} }));`;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: directory, env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8'
    }));
  }
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'news-config-'));
    delete process.env[key];
  });
  afterEach(() => {
    delete process.env[key];
    rmSync(directory, { recursive: true, force: true });
  });

  it('resolves the default configuration independently of the working directory', () => {
    expect(configPath).toBe(fileURLToPath(new URL('../.env', import.meta.url)));
  });

  it('loads quoted values and comments from a configuration file', () => {
    const file = path.join(directory, '.env');
    writeFileSync(file, `# Configuration\n${key}="admin@example.com, owner@example.com"\n`);
    expect(loadInNode(file)).toEqual({ loaded: true, value: 'admin@example.com, owner@example.com' });
  });

  it('keeps existing deployment environment values', () => {
    const file = path.join(directory, '.env');
    writeFileSync(file, `${key}=from-file\n`);
    process.env[key] = 'from-environment';
    expect(loadInNode(file)).toEqual({ loaded: true, value: 'from-environment' });
  });

  it('allows a missing file for environment-only deployments', () => {
    expect(loadConfig(path.join(directory, 'missing.env'))).toBe(false);
  });

  it('reports unreadable configuration instead of silently ignoring it', () => {
    expect(() => loadConfig(directory)).toThrow();
  });
});

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [, , project, ...flags] = process.argv;
const production = flags.includes('--production');
const reinstall = flags.includes('--reinstall');
const libc = process.platform === 'linux'
  ? (process.report.getReport().header.glibcVersionRuntime ? 'glibc' : 'musl')
  : undefined;
const dependencyFlags = [production ? '--omit=dev' : '--include=dev'];

function npm(args, silent = false) {
  const windows = process.platform === 'win32';
  const result = spawnSync(windows ? 'npm.cmd' : 'npm', args, {
    cwd: project,
    shell: windows,
    stdio: silent ? 'ignore' : 'inherit'
  });
  if (result.error) throw result.error;
  return result.status;
}

function matchesTarget(values, current) {
  if (!values) return true;
  if (values.includes(`!${current}`)) return false;
  return values.includes(current) || values.includes('any') || values.every(value => value.startsWith('!'));
}

function matchesLock() {
  try {
    const readPackages = file => JSON.parse(readFileSync(path.join(project, file), 'utf8')).packages;
    const expected = readPackages('package-lock.json');
    const installed = readPackages('node_modules/.package-lock.json');
    return Object.entries(expected).every(([location, dependency]) => {
      if (!location || (production && dependency.dev)) return true;

      const { os, cpu } = dependency;
      if (!matchesTarget(os, process.platform) || !matchesTarget(cpu, process.arch)
        || !matchesTarget(dependency.libc, libc)) {
        return true;
      }

      const actual = installed[location];
      if (!actual || !existsSync(path.join(project, location, 'package.json'))) {
        const platformSpecific = os || cpu || dependency.libc;
        return !!dependency.optional && !platformSpecific;
      }
      return ['version', 'resolved', 'integrity'].every(key => actual[key] === dependency[key]);
    });
  } catch {
    return false;
  }
}

if (!reinstall && matchesLock() && npm(['ls', '--all', ...dependencyFlags], true) === 0) {
  console.log('  Existing dependencies match package-lock.json; reusing them.');
} else {
  console.log(reinstall ? '  Reinstalling dependencies...' : '  Dependencies are missing or outdated; installing...');
  process.exitCode = npm(['ci', ...dependencyFlags]) ?? 1;
}

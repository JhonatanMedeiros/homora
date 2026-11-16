import { spawn } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(pnpm, [script], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', (error) => {
      console.error(`Could not start pnpm ${script}:`, error.message);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

// Fast enough to run side by side. `type-check` also compiles the workspace packages, which the
// tests import, so it must finish before them.
const staticChecks = ['lint', 'format:check', 'type-check'];
const staticResults = await Promise.all(staticChecks.map(run));

if (staticResults.some((code) => code !== 0)) process.exit(1);

if ((await run('test')) !== 0) process.exit(1);

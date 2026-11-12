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

const staticChecks = ['lint', 'format:check'];
const staticResults = await Promise.all(staticChecks.map(run));

if (staticResults.some((code) => code !== 0)) process.exit(1);

for (const script of ['type-check', 'test']) {
  if ((await run(script)) !== 0) process.exit(1);
}

import { spawn } from 'node:child_process';

const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(bun, ['run', script], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', (error) => {
      console.error(`Could not start bun run ${script}:`, error.message);
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

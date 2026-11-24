// Type-checks the whole workspace with the native compiler: the libraries are emitted first (their
// `dist` is what the apps resolve), then the apps and any `tsconfig.tests.json` project are checked
// in parallel. Apps and test projects are discovered, so a new one needs no change here.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const tsc = new URL('../../node_modules/.bin/tsc', import.meta.url).pathname;
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${args.join(' ')} failed`)),
    );
  });
const found = (root, file) =>
  readdirSync(root)
    .map((dir) => `${root}/${dir}/${file}`)
    .filter((path) => existsSync(path));

await run(process.execPath, ['scripts/ci/build-packages.mjs']);
await Promise.all([
  ...found('apps', 'tsconfig.json').map((project) => run(tsc, ['-p', project, '--noEmit'])),
  ...found('packages', 'tsconfig.tests.json').map((project) => run(tsc, ['-p', project])),
]);

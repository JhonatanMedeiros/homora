// Builds the workspace libraries with the native TypeScript compiler (tsc), in dependency waves.
// The tests import the compiled `dist` of these packages, so this is all a test job needs.
// The apps (backend, frontend) are not built here; `pnpm build` still covers them in the build job.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const dirs = readdirSync('packages').map((d) => `packages/${d}`);
const meta = new Map(
  dirs.map((dir) => {
    const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) =>
      n.startsWith('@homora/'),
    );
    return [pkg.name, { dir, deps, hasCatalog: dir === 'packages/integrations' }];
  }),
);

const run = (cmd, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} failed in ${cwd}`)),
    );
  });

const done = new Set();
const started = new Map();
const build = (name) => {
  if (started.has(name)) return started.get(name);
  const { dir, deps, hasCatalog } = meta.get(name);
  const job = Promise.all(deps.filter((d) => meta.has(d)).map(build)).then(async () => {
    if (hasCatalog) await run('node', ['scripts/integration-catalog.mjs', '--check'], dir);
    await run(
      new URL('../../node_modules/.bin/tsc', import.meta.url).pathname,
      ['-p', 'tsconfig.json'],
      dir,
    );
    done.add(name);
  });
  started.set(name, job);
  return job;
};
await Promise.all([...meta.keys()].map(build));

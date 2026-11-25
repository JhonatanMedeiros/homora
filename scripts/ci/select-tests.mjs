// Selects the test files a diff can reach. Prints one file per line, or the word ALL when the
// whole suite must run. Usage: bun scripts/ci/select-tests.mjs [--base <ref>] [--files a,b,c]
//
// Layers:
//  1. Full-run triggers: files that are not imported by tests but can change any result
//     (lockfile, package manifests, configs, test setup, CI scripts, migrations, generated data).
//  2. Vitest's own import graph (`vitest list --changed`), which covers direct imports.
//  3. Workspace dependents: tests may import compiled `dist` of sibling packages, so the import graph
//     stops at the package boundary. A change in packages/<x> also selects every test of the
//     workspaces that depend on <x>, transitively.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const baseRef = opt('--base') ?? 'origin/main';
const sh = (cmd, a) =>
  execFileSync(cmd, a, {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const lines = (s) => s.split('\n').filter(Boolean);
// `vitest list` prefixes each file with its project: `[shared] apps/backend/src/x.test.ts`.
const listed = (s) => lines(s).map((line) => line.replace(/^\[[^\]]+\] /, ''));

// Compare with the point where the branch left the base, not with the base's current tip.
const base = opt('--files') ? baseRef : sh('git', ['merge-base', 'HEAD', baseRef]);
const changed = opt('--files')
  ? opt('--files').split(',')
  : [
      ...new Set([
        ...lines(sh('git', ['diff', '--name-only', base])),
        ...lines(sh('git', ['ls-files', '--others', '--exclude-standard'])),
      ]),
    ];

const FULL_TRIGGERS = [
  /(^|\/)package\.json$/,
  /^bun\.lock$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)vite(st)?\.config\./,
  /^turbo\.json$/,
  /^vitest\.setup\./,
  /^packages\/db\/migrations\//,
  /^scripts\/ci\//,
  /^\.github\/(workflows|actions)\//,
];
const trigger = changed.find((f) => FULL_TRIGGERS.some((re) => re.test(f)));
if (trigger) {
  console.error(`full run: ${trigger}`);
  console.log('ALL');
  process.exit(0);
}

// Workspace graph.
const workspaces = [];
for (const root of ['apps', 'packages']) {
  for (const dir of readdirSync(root)) {
    const file = join(root, dir, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    workspaces.push({ dir: `${root}/${dir}`, name: pkg.name, deps: Object.keys(deps) });
  }
}
const dependentsOf = (name, seen = new Set()) => {
  for (const w of workspaces) {
    if (w.deps.includes(name) && !seen.has(w.name)) {
      seen.add(w.name);
      dependentsOf(w.name, seen);
    }
  }
  return seen;
};

const allTests = listed(sh('bun', ['--bun', 'vitest', 'list', '--filesOnly'])).filter((f) =>
  /\.test\.tsx?$/.test(f),
);
const selected = new Set();

// 2. Import graph. `--files` simulates a diff without reading git, so this layer is skipped there.
if (!opt('--files'))
  for (const f of listed(sh('bun', ['--bun', 'vitest', 'list', '--changed', base, '--filesOnly'])))
    if (/\.test\.tsx?$/.test(f)) selected.add(f);

// A changed test file always runs.
for (const f of changed) if (allTests.includes(f)) selected.add(f);

// 3. Workspace dependents (the changed workspace's own tests are covered by the import graph).
const touched = workspaces.filter((w) => changed.some((f) => f.startsWith(`${w.dir}/`)));
for (const w of touched) {
  const names = dependentsOf(w.name);
  for (const target of workspaces.filter((x) => names.has(x.name)))
    for (const t of allTests) if (t.startsWith(`${target.dir}/`)) selected.add(t);
}

console.error(`changed=${changed.length} selected=${selected.size}/${allTests.length}`);
console.log([...selected].sort().join('\n') || 'NONE');

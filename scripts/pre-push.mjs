// Runs before every `git push` (see .husky/pre-push): formatting, lint and types on what the push
// changes, in a few seconds. CI runs the same checks, so this only moves the failure earlier.
// Skip it for one push with `git push --no-verify`.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const TARGET_SECONDS = 9;
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const maybe = (...args) => {
  try {
    return git(...args);
  } catch {
    return;
  }
};

// Files this push adds to the remote: against the upstream branch, else where the branch left main.
const base =
  maybe('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}') ??
  maybe('merge-base', 'HEAD', 'origin/main') ??
  'HEAD~1';
const changed = [
  ...new Set([
    ...git('diff', '--name-only', '--diff-filter=d', base).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ]),
].filter((file) => file && existsSync(file));

const source = changed.filter((file) => /\.(?:[cm]?[jt]s|tsx)$/.test(file));
const formattable = changed.filter((file) =>
  /\.(?:[cm]?[jt]sx?|json|md|html|css|ya?ml)$/.test(file),
);
const typed = changed.some((file) => /\.(?:tsx?|json)$/.test(file));

const bin = (name) => new URL(`../node_modules/.bin/${name}`, import.meta.url).pathname;
const run = (label, command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => resolve({ label, ok: code === 0, output }));
  });

const started = performance.now();
const checks = [];
if (formattable.length > 0)
  checks.push(
    run('format', bin('oxfmt'), ['--check', '--no-error-on-unmatched-pattern', ...formattable]),
  );
if (source.length > 0) checks.push(run('lint', bin('oxlint'), ['--quiet', ...source]));
if (typed) checks.push(run('types', 'node', ['scripts/ci/typecheck.mjs']));

const results = await Promise.all(checks);
const seconds = (performance.now() - started) / 1000;
for (const { label, ok, output } of results) {
  if (!ok) console.error(`\n✖ ${label}\n${output.trim()}`);
}
const failed = results.filter((result) => !result.ok).map((result) => result.label);
const scope = `${changed.length} changed file${changed.length === 1 ? '' : 's'}`;
if (failed.length > 0) {
  console.error(
    `\npre-push: ${failed.join(', ')} failed (${scope}, ${seconds.toFixed(1)}s). Fix it, or push with --no-verify.`,
  );
  process.exit(1);
}
const slow =
  seconds > TARGET_SECONDS ? ` - over the ${TARGET_SECONDS}s target, find what got slower` : '';
console.log(
  `pre-push: ${results.length} checks passed on ${scope} in ${seconds.toFixed(1)}s${slow}`,
);

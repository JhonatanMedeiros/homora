// Runs one shard of the test suite the way CI does: `bun scripts/ci/run-tests.mjs <index>/<total>`.
//
//  - Pull requests run only the tests the diff can reach (scripts/ci/select-tests.mjs).
//  - Merge queue, pushes and anything else run the whole suite, so selection only narrows feedback.
//  - Test files run in random order, with the seed printed, to flush out state that leaks between
//    files. Re-run a failure with `bun --bun vitest run --sequence.shuffle.files --sequence.seed=<seed>`.
import { execFileSync, spawnSync } from 'node:child_process';

const [shard] = process.argv.slice(2);
if (!/^\d+\/\d+$/.test(shard ?? '')) {
  console.error('Usage: bun scripts/ci/run-tests.mjs <index>/<total>');
  process.exit(2);
}

const { GITHUB_EVENT_NAME: event, GITHUB_BASE_REF: baseBranch, GITHUB_RUN_ID: runId } = process.env;
let files = [];
if (event === 'pull_request' && baseBranch) {
  const out = execFileSync(
    process.execPath,
    ['scripts/ci/select-tests.mjs', '--base', `origin/${baseBranch}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ).trim();
  if (out === 'NONE') {
    console.log('No test can be reached by this diff; the full suite runs in the merge queue.');
    process.exit(0);
  }
  if (out !== 'ALL') files = out.split('\n');
  console.log(
    files.length > 0 ? `Selected ${files.length} test files.` : 'Running the full suite.',
  );
}

const seed = runId ?? String(Date.now() % 1_000_000);
console.log(`Sequence seed: ${seed}`);
const args = ['--bun', 'vitest', 'run', `--shard=${shard}`, '--sequence.shuffle.files'];
args.push(`--sequence.seed=${seed}`, '--passWithNoTests', ...files);
process.exit(spawnSync(process.execPath, args, { stdio: 'inherit' }).status ?? 1);

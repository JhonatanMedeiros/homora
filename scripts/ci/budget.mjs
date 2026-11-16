// Fails a CI step that runs longer than its time budget, so a slow check shows up as a red build
// instead of a slowly growing queue. Usage: node scripts/ci/budget.mjs <seconds> <label> -- <command...>
//
// The command always runs to completion and its own failures are reported as they are. A command
// that hangs is killed at three times the budget. The budgets in the workflow sit above what the
// hosted runners measure today, so only a real regression trips them; see docs/maintainers/ci.md.
import { spawn } from 'node:child_process';

const separator = process.argv.indexOf('--');
const [seconds, label] = process.argv.slice(2, separator);
const command = process.argv.slice(separator + 1);
if (separator < 0 || !Number(seconds) || !label || command.length === 0) {
  console.error('Usage: node scripts/ci/budget.mjs <seconds> <label> -- <command...>');
  process.exit(2);
}

const budget = Number(seconds);
const started = performance.now();
// Its own process group, so that a hung `pnpm` takes its children down with it.
const child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true });
const hung = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), budget * 3000);

child.on('close', (code, signal) => {
  clearTimeout(hung);
  const elapsed = (performance.now() - started) / 1000;
  const note = `${label}: ${elapsed.toFixed(1)}s of a ${budget}s budget`;
  if (code !== 0) {
    console.error(`${note}${signal ? ` (killed by ${signal})` : ''}`);
    process.exit(code ?? 1);
  }
  if (elapsed > budget) {
    console.error(`::error::${note} - over budget. Find what got slower instead of raising it.`);
    process.exit(1);
  }
  console.log(note);
});

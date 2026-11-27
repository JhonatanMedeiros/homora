import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The lines of one Dockerfile stage, with the stages it is built from. */
async function stageWithParents(name) {
  const dockerfile = await readFile('Dockerfile', 'utf8');
  const stages = new Map(
    dockerfile
      .split(/^(?=FROM )/m)
      .map((text) => [/^FROM (\S+) AS (\S+)/.exec(text), text])
      .filter(([match]) => match)
      .map(([match, text]) => [match[2], { parent: match[1], text }]),
  );
  let text = '';
  for (let stage = stages.get(name); stage; stage = stages.get(stage.parent)) text += stage.text;
  return text;
}

/** Scripts the guides tell people to run inside the container. */
async function documentedScripts() {
  const files = (await readdir('docs', { recursive: true }))
    .filter((file) => file.endsWith('.md') && !file.includes('.vitepress'))
    .map((file) => join('docs', file));
  const found = new Set();
  for (const file of ['README.md', ...files])
    for (const [, script] of (await readFile(file, 'utf8')).matchAll(
      /exec backend\s+node\s+(scripts\/[\w-]+\.mjs)/g,
    ))
      found.add(script);
  return [...found].sort();
}

test('the images carry every script the guides run inside the container', async () => {
  const scripts = await documentedScripts();
  // Guards the search itself: these are documented today.
  for (const expected of ['scripts/auth-reset.mjs', 'scripts/css-reset.mjs'])
    assert.ok(scripts.includes(expected), expected);
  // `compose.yml` and the release image are built from `homora`.
  for (const target of ['backend', 'homora']) {
    const copies = (await stageWithParents(target))
      .split('\n')
      .filter((line) => line.startsWith('COPY ') && line.includes(' /app/scripts/'))
      .join('\n');
    for (const script of scripts) assert.ok(copies.includes(script), `${target}: ${script}`);
  }
});

// The image has no workspace around the scripts, so they can only rely on Node itself.
test('the scripts run in the container import nothing but Node', async () => {
  for (const script of await documentedScripts())
    for (const [, from] of (await readFile(script, 'utf8')).matchAll(
      /(?:\bfrom\s+|\bimport\(\s*)['"]([^'"]+)['"]/g,
    ))
      assert.ok(from.startsWith('node:'), `${script}: ${from}`);
});

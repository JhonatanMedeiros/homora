import { readFileSync } from 'node:fs';

const tag = process.env.RELEASE_TAG ?? '';
const match =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(tag);
if (
  !match ||
  (match[4] &&
    match[4]
      .split('.')
      .some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))
) {
  console.error('RELEASE_TAG must be a valid version tag, for example v0.1.0.');
  process.exit(1);
}
const version = tag.slice(1);
const backend = JSON.parse(readFileSync('apps/backend/package.json', 'utf8')).version;
const manifest = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8'))['.'];
const file = readFileSync('version.txt', 'utf8').trim();
if ([backend, manifest, file].some((value) => value !== version)) {
  console.error('Release tag, backend version, manifest and version.txt must match.');
  process.exit(1);
}
console.log(`Release version verified: ${version}`);

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORKSPACE_GROUPS = ['apps', 'packages'];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * Finds all `apps/*\/package.json` and `packages/*\/package.json` files that declare a `version`.
 */
export function findVersionedWorkspacePackages(rootDir = process.cwd()) {
  const found = [];
  for (const group of WORKSPACE_GROUPS) {
    const groupDir = join(rootDir, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relPath = `${group}/${entry.name}/package.json`;
      const pkgPath = join(rootDir, relPath);
      if (!existsSync(pkgPath)) continue;
      const pkg = readJson(pkgPath);
      if (typeof pkg.version === 'string') {
        found.push({ path: relPath, version: pkg.version });
      }
    }
  }
  return found.toSorted((a, b) => a.path.localeCompare(b.path));
}

/**
 * Validates that every versioned workspace package is listed in `release-please-config.json`
 * and that all versions match `apps/backend/package.json` and `.release-please-manifest.json`.
 */
export function checkReleasePackages(rootDir = process.cwd()) {
  const errors = [];

  const configPath = join(rootDir, 'release-please-config.json');
  const config = readJson(configPath);
  const extraFiles = config?.packages?.['.']?.['extra-files'];
  if (!Array.isArray(extraFiles)) {
    errors.push('release-please-config.json must define packages["."]["extra-files"] as an array.');
  }

  const registeredPaths = new Set(
    (Array.isArray(extraFiles) ? extraFiles : [])
      .filter(
        (entry) =>
          entry &&
          entry.type === 'json' &&
          entry.jsonpath === '$.version' &&
          typeof entry.path === 'string',
      )
      .map((entry) => entry.path),
  );

  const backendPkg = readJson(join(rootDir, 'apps/backend/package.json'));
  const backendVersion = backendPkg?.version;
  if (typeof backendVersion !== 'string' || backendVersion.length === 0) {
    errors.push('apps/backend/package.json must declare a non-empty version.');
  }

  const manifest = readJson(join(rootDir, '.release-please-manifest.json'));
  const manifestVersion = manifest?.['.'];
  if (typeof manifestVersion !== 'string' || manifestVersion.length === 0) {
    errors.push('.release-please-manifest.json must declare a non-empty "." version.');
  }

  if (
    typeof backendVersion === 'string' &&
    typeof manifestVersion === 'string' &&
    backendVersion !== manifestVersion
  ) {
    errors.push(
      `apps/backend/package.json version (${backendVersion}) does not match .release-please-manifest.json (${manifestVersion}).`,
    );
  }

  const packages = findVersionedWorkspacePackages(rootDir);
  for (const pkg of packages) {
    if (!registeredPaths.has(pkg.path)) {
      errors.push(
        `${pkg.path} has a version field (${pkg.version}) but is missing from release-please-config.json packages["."]["extra-files"].`,
      );
    }
    if (typeof backendVersion === 'string' && pkg.version !== backendVersion) {
      errors.push(
        `${pkg.path} version (${pkg.version}) does not match apps/backend/package.json (${backendVersion}).`,
      );
    }
  }

  return { ok: errors.length === 0, errors, packages, version: backendVersion };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkReleasePackages(process.cwd());
  if (!result.ok) {
    for (const error of result.errors) console.error(error);
    process.exit(1);
  }
  console.log(
    `Release packages verified (${result.packages.length} packages at ${result.version}).`,
  );
}

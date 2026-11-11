import http from 'node:http';
import { InputError } from './api-error.js';
import type { ImportedService, ParsedImport } from './config-transfer.js';
import { add, finish, groupFor, newCollector } from './importers.js';

/**
 * Service discovery via Docker container labels. Optional (active only if
 * `HOMORA_DOCKER_HOST` is set), read-only (single `GET /containers/json` call),
 * and generates suggestions only: no card is created without review and confirmation
 * in the UI. Container labels and names are untrusted input.
 */
export type DockerHost =
  { kind: 'unix'; path: string } | { kind: 'tcp'; host: string; port: number };
export type DockerContainer = {
  Id?: unknown;
  Names?: unknown;
  Labels?: unknown;
};
export type DockerSource = { list(): Promise<DockerContainer[]> };

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_CONTAINERS = 1000;
const TIMEOUT_MS = 5000;

/**
 * Parses `HOMORA_DOCKER_HOST`: `unix:///path/docker.sock` or `http://host:port` (e.g. from
 * an unprivileged proxy). Administrator setting, not user input. Without credentials, path,
 * or HTTPS: secure transport is the local socket or the proxy private network.
 */
export function parseDockerHost(value: string | undefined): DockerHost | null {
  if (value === undefined || value.trim() === '') return null;
  const text = value.trim();
  if (text.startsWith('unix://')) {
    const path = text.slice('unix://'.length);
    if (!path.startsWith('/') || path.includes('\0') || path.length > 200)
      throw new Error('Invalid HOMORA_DOCKER_HOST.');
    return { kind: 'unix', path };
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Invalid HOMORA_DOCKER_HOST.');
  }
  if (
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname
  )
    throw new Error('Invalid HOMORA_DOCKER_HOST. Use unix:///path or http://host:port.');
  return { kind: 'tcp', host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 80) };
}

/** Minimal Docker API client: lists running containers and nothing more. */
export function createDockerSource(host: DockerHost): DockerSource {
  return {
    list() {
      return new Promise<DockerContainer[]>((resolve, reject) => {
        const target =
          host.kind === 'unix' ? { socketPath: host.path } : { host: host.host, port: host.port };
        const req = http.request(
          {
            ...target,
            method: 'GET',
            path: '/containers/json',
            headers: { Host: 'localhost', Accept: 'application/json' },
            timeout: TIMEOUT_MS,
            agent: false,
          },
          (res) => {
            if (res.statusCode !== 200) {
              res.destroy();
              reject(new InputError('docker-unavailable'));
              return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            res.on('data', (chunk: Buffer) => {
              length += chunk.length;
              if (length > MAX_RESPONSE_BYTES) {
                req.destroy();
                reject(new InputError('docker-invalid-response'));
                return;
              }
              chunks.push(chunk);
            });
            res.on('aborted', () => reject(new InputError('docker-unavailable')));
            res.on('error', () => reject(new InputError('docker-unavailable')));
            res.on('end', () => {
              try {
                const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (!Array.isArray(body)) throw new Error();
                resolve(body.slice(0, MAX_CONTAINERS) as DockerContainer[]);
              } catch {
                reject(new InputError('docker-invalid-response'));
              }
            });
          },
        );
        req.on('timeout', () => req.destroy());
        req.on('error', () => reject(new InputError('docker-unavailable')));
        req.end();
      });
    },
  };
}

const label = (labels: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = labels[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
};

export type DiscoveryEntry = { id: string; container: string; group: string; url: string };

/**
 * Converts container labels into an import document. Recognizes `homora.url`, `homora.name`,
 * `homora.group`, `homora.description`, and `homora.icon`, as well as equivalent `homepage.*`
 * labels (`href` instead of `url`) for users migrating from Homepage. `homora.*` takes precedence.
 * Containers without URL are ignored. `only` limits to IDs selected during review.
 * `entries` accompanies cards in the document in matching order.
 */
export function parseDocker(
  containers: DockerContainer[],
  only?: ReadonlySet<string>,
): { parsed: ParsedImport; entries: DiscoveryEntry[]; scanned: number } {
  const collector = newCollector();
  const owner = new Map<ImportedService, { id: string; container: string }>();
  containers.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const id = typeof item.Id === 'string' ? item.Id.slice(0, 12) : '';
    if (!/^[0-9a-f]{12}$/.test(id)) return;
    if (only && !only.has(id)) return;
    const labels =
      item.Labels && typeof item.Labels === 'object' && !Array.isArray(item.Labels)
        ? (item.Labels as Record<string, unknown>)
        : {};
    const url = label(labels, 'homora.url', 'homepage.href');
    if (!url) return;
    const names = Array.isArray(item.Names) ? item.Names : [];
    const container =
      (typeof names[0] === 'string' ? names[0].replace(/^\//, '') : '').slice(0, 80) || id;
    const path = `containers[${index}]`;
    const group = groupFor(
      collector,
      label(labels, 'homora.group', 'homepage.group') ?? 'Docker',
      path,
    );
    if (!group) return;
    const before = group.services.length;
    add(
      collector,
      group,
      {
        name: label(labels, 'homora.name', 'homepage.name') ?? container,
        url,
        description: label(labels, 'homora.description', 'homepage.description'),
        icon: label(labels, 'homora.icon', 'homepage.icon'),
      },
      path,
    );
    if (group.services.length > before)
      owner.set(group.services[group.services.length - 1], { id, container });
  });
  const parsed = finish(collector);
  const entries = parsed.document.groups.flatMap((group) =>
    group.services.map((service) => ({
      id: owner.get(service)?.id ?? '',
      container: owner.get(service)?.container ?? '',
      group: group.name,
      url: service.url,
    })),
  );
  return { parsed, entries, scanned: containers.length };
}

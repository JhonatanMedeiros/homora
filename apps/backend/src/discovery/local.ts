import http from 'node:http';
import { InputError } from '../api-error.js';

/**
 * Service discovery via Docker container labels. Optional (active only if
 * `HOMORA_DOCKER_HOST` is set), read-only (single `GET /containers/json` call),
 * and generates suggestions only: no card is created without review and confirmation
 * in the UI. Container labels and names are untrusted input.
 */
export type DockerHost =
  | { kind: 'unix'; path: string }
  | { kind: 'tcp'; host: string; port: number };
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
  return {
    kind: 'tcp',
    host: url.hostname.replaceAll(/^\[|\]$/g, ''),
    port: Number(url.port || 80),
  };
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
                if (!Array.isArray(body)) throw new TypeError();
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

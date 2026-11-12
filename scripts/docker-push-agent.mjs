import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const LABELS = new Set([
  'homora.url',
  'homora.name',
  'homora.group',
  'homora.description',
  'homora.icon',
  'homepage.href',
  'homepage.name',
  'homepage.group',
  'homepage.description',
  'homepage.icon',
]);
const MAX_DOCKER_BYTES = 4 * 1024 * 1024;

export function selectInventory(input) {
  if (!Array.isArray(input) || input.length > 1000) throw new Error('Invalid Docker inventory');
  const containers = [];
  for (const item of input) {
    if (
      !item ||
      typeof item !== 'object' ||
      !/^[a-f0-9]{64}$/.test(item.Id) ||
      !Array.isArray(item.Names)
    )
      throw new Error('Invalid Docker inventory');
    const labels = {};
    for (const [key, value] of Object.entries(item.Labels ?? {}))
      if (LABELS.has(key) && typeof value === 'string') labels[key] = value;
    if (!labels['homora.url'] && !labels['homepage.href']) continue;
    containers.push({ Id: item.Id, Names: item.Names.slice(0, 1), Labels: labels });
  }
  return { containers };
}
function response(req, limit) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => req.destroy(new Error('Timeout')), 5000);
    req.once('close', () => clearTimeout(deadline));
    req.on('response', (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 204) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      let length = 0;
      res.on('data', (chunk) => {
        length += chunk.length;
        if (length > limit) req.destroy(new Error('Response too large'));
        else chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('Response aborted')));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Timeout')));
  });
}
export async function collect(socketPath) {
  const req = http.request({ socketPath, path: '/containers/json', method: 'GET', agent: false });
  const result = response(req, MAX_DOCKER_BYTES);
  req.end();
  return selectInventory(JSON.parse((await result).toString('utf8')));
}
export async function publish(url, token, inventory, ca) {
  const target = new URL(url);
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('Expected an HTTPS origin');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid token');
  const body = JSON.stringify(inventory);
  if (Buffer.byteLength(body) > 1024 * 1024) throw new Error('Inventory too large');
  const req = https.request(new URL('/docker-push/inventory', target), {
    method: 'POST',
    ca,
    agent: false,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
  });
  const result = response(req, 1024);
  req.end(body);
  await result;
}
async function main() {
  const origin = process.env.HOMORA_AGENT_ORIGIN;
  const tokenFile = process.env.HOMORA_AGENT_TOKEN_FILE;
  const socket = process.env.HOMORA_AGENT_DOCKER_SOCKET ?? '/var/run/docker.sock';
  if (!origin || !tokenFile)
    throw new Error('HOMORA_AGENT_ORIGIN and HOMORA_AGENT_TOKEN_FILE are required');
  const seconds = Number(process.env.HOMORA_AGENT_INTERVAL ?? '60');
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > 240)
    throw new Error('Invalid interval');
  const ca = process.env.HOMORA_AGENT_CA_FILE
    ? readFileSync(process.env.HOMORA_AGENT_CA_FILE)
    : undefined;
  for (;;) {
    try {
      await publish(origin, readFileSync(tokenFile, 'utf8').trim(), await collect(socket), ca);
    } catch {
      console.error('Docker inventory publication failed; retrying.');
    }
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error('Invalid agent configuration.');
    process.exitCode = 1;
  });

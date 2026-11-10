import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import {
  createDockerSource,
  parseDockerHost,
  parseDocker,
  type DockerContainer,
  type DockerSource,
} from './docker-discovery.js';
import { InputError } from './api-error.js';

const id = (n: number) => String(n).padStart(12, 'a');
const containers: DockerContainer[] = [
  {
    Id: `${id(1)}ffff`,
    Names: ['/jellyfin'],
    Labels: {
      'homora.url': 'http://192.168.1.10:8096',
      'homora.group': 'Mídia',
      'homora.icon': 'brand:jellyfin',
      'homora.description': 'Filmes',
    },
  },
  {
    Id: id(2),
    Names: ['/sonarr'],
    Labels: {
      'homepage.href': 'http://192.168.1.10:8989',
      'homepage.name': 'Sonarr',
      'homepage.group': 'Mídia',
    },
  },
  { Id: id(3), Names: ['/db'], Labels: { 'com.docker.compose.project': 'x' } },
  { Id: id(4), Names: ['/ruim'], Labels: { 'homora.url': 'javascript:alert(1)' } },
  {
    Id: id(5),
    Names: ['/dupla'],
    Labels: {
      'homora.url': 'http://a.lan',
      'homepage.href': 'http://b.lan',
      'homora.name': 'Vence',
    },
  },
  { Id: 'não-é-id', Labels: { 'homora.url': 'http://x.lan' } },
];

it('lê o endereço do Docker só como socket local ou http do proxy, sem credenciais nem caminho', () => {
  expect(parseDockerHost(undefined)).toBeNull();
  expect(parseDockerHost('  ')).toBeNull();
  expect(parseDockerHost('unix:///var/run/docker.sock')).toEqual({
    kind: 'unix',
    path: '/var/run/docker.sock',
  });
  expect(parseDockerHost('http://docker-proxy:2375')).toEqual({
    kind: 'tcp',
    host: 'docker-proxy',
    port: 2375,
  });
  for (const bad of [
    'https://docker-proxy:2376',
    'http://user:pw@proxy:2375',
    'http://proxy:2375/v1.4',
    'http://proxy:2375/?x=1',
    'unix://relativo.sock',
    'tcp://proxy:2375',
    'lixo',
  ])
    expect(() => parseDockerHost(bad), bad).toThrow('HOMORA_DOCKER_HOST');
});

it('transforma labels em sugestões, aceita homepage.* e ignora o que não é seguro ou não tem URL', () => {
  const { parsed, entries, scanned } = parseDocker(containers);
  expect(scanned).toBe(6);
  expect(parsed.document.groups.map((g) => [g.name, g.services.map((s) => s.name)])).toEqual([
    ['Mídia', ['jellyfin', 'Sonarr']],
    ['Docker', ['Vence']],
  ]);
  const jellyfin = parsed.document.groups[0].services[0];
  expect(jellyfin).toMatchObject({
    url: 'http://192.168.1.10:8096/',
    icon: 'brand:jellyfin',
    description: 'Filmes',
    allowPrivate: false,
  });
  // homora.* vence homepage.* quando os dois existem
  expect(parsed.document.groups[1].services[0].url).toBe('http://a.lan/');
  // URL inválida vira problema relatado, nunca card
  expect(parsed.issues.some((issue) => issue.path === 'containers[3]')).toBe(true);
  // entries acompanha os cards, na mesma ordem
  expect(entries.map((e) => [e.id, e.container, e.group])).toEqual([
    [id(1), 'jellyfin', 'Mídia'],
    [id(2), 'sonarr', 'Mídia'],
    [id(5), 'dupla', 'Docker'],
  ]);
});

it('limita ao conjunto de IDs escolhidos', () => {
  const { parsed, entries } = parseDocker(containers, new Set([id(2)]));
  expect(entries.map((e) => e.id)).toEqual([id(2)]);
  expect(parsed.document.groups).toHaveLength(1);
  expect(parseDocker(containers, new Set()).parsed.document.groups).toHaveLength(0);
});

const sockets: http.Server[] = [];
afterEach(async () => {
  await Promise.all(sockets.splice(0).map((s) => new Promise((r) => s.close(r))));
});
function serve(handler: http.RequestListener, listen: string | number) {
  const server = http.createServer(handler);
  sockets.push(server);
  return new Promise<void>((resolve) => server.listen(listen as never, '127.0.0.1', resolve));
}

it('o cliente faz só um GET /containers/json, por socket e por TCP, e rejeita respostas ruins', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-docker-'));
  try {
    const seen: string[] = [];
    const handler: http.RequestListener = (req, res) => {
      seen.push(`${req.method} ${req.url}`);
      if (req.url === '/containers/json') {
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify(containers));
      }
      res.statusCode = 403;
      res.end('forbidden');
    };
    const unixPath = join(dir, 'docker.sock');
    const unix = http.createServer(handler);
    sockets.push(unix);
    await new Promise<void>((resolve) => unix.listen(unixPath, resolve));
    expect(await createDockerSource({ kind: 'unix', path: unixPath }).list()).toHaveLength(6);

    await serve(handler, 0);
    const port = (sockets[1].address() as { port: number }).port;
    expect(await createDockerSource({ kind: 'tcp', host: '127.0.0.1', port }).list()).toHaveLength(
      6,
    );
    expect(seen).toEqual(['GET /containers/json', 'GET /containers/json']);

    // 403 do proxy, JSON inválido, objeto no lugar de lista e conexão recusada
    await serve((_req, res) => ((res.statusCode = 403), res.end()), 0);
    const denied = (sockets[2].address() as { port: number }).port;
    await expect(
      createDockerSource({ kind: 'tcp', host: '127.0.0.1', port: denied }).list(),
    ).rejects.toMatchObject({ code: 'docker-unavailable' });
    await serve((_req, res) => res.end('não é json'), 0);
    const junk = (sockets[3].address() as { port: number }).port;
    await expect(
      createDockerSource({ kind: 'tcp', host: '127.0.0.1', port: junk }).list(),
    ).rejects.toMatchObject({ code: 'docker-invalid-response' });
    await serve((_req, res) => res.end('{"a":1}'), 0);
    const obj = (sockets[4].address() as { port: number }).port;
    await expect(
      createDockerSource({ kind: 'tcp', host: '127.0.0.1', port: obj }).list(),
    ).rejects.toMatchObject({ code: 'docker-invalid-response' });
    await expect(
      createDockerSource({ kind: 'tcp', host: '127.0.0.1', port: 1 }).list(),
    ).rejects.toBeInstanceOf(InputError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function setup(source?: DockerSource) {
  const dir = mkdtempSync(join(tmpdir(), 'homora-discovery-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  auth.setup('senha-para-testes');
  const cookie = `homora_session=${auth.login('senha-para-testes', 'test')}`;
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth, undefined, [], source);
  const send = (method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  return {
    send,
    done: async () => {
      await app.close();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

it('sem HOMORA_DOCKER_HOST a descoberta fica desligada e não importa nada', async () => {
  const { send, done } = setup();
  try {
    expect((await send('GET', '/api/discovery')).json()).toEqual({ enabled: false });
    const response = await send('POST', '/api/discovery/import', { ids: [id(1)] });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('discovery-disabled');
  } finally {
    await done();
  }
});

it('lista sugestões sem gravar, importa só os IDs escolhidos e nunca libera rede privada sozinha', async () => {
  const { send, done } = setup({ list: async () => containers });
  try {
    const found = (await send('GET', '/api/discovery')).json();
    expect(found).toMatchObject({ enabled: true, scanned: 6 });
    expect(found.entries).toHaveLength(3);
    expect(found.plan.summary).toMatchObject({ newServices: 3, newGroups: 2 });
    expect((await send('GET', '/api/services')).json()).toEqual([]);

    // o cliente só envia IDs; ID inexistente ou malformado não vira card
    expect((await send('POST', '/api/discovery/import', { ids: ['xx'] })).statusCode).toBe(400);
    expect((await send('POST', '/api/discovery/import', { ids: [], extra: 1 })).statusCode).toBe(
      400,
    );
    const stale = await send('POST', '/api/discovery/import', {
      ids: [id(1)],
      expectedVersion: found.version + 5,
    });
    expect(stale.statusCode).toBe(409);

    const imported = await send('POST', '/api/discovery/import', {
      ids: [id(1), id(9)],
      expectedVersion: found.version,
    });
    expect(imported.json().created).toBe(1);
    const services = (await send('GET', '/api/services')).json();
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({ name: 'jellyfin', category: 'Mídia', allowPrivate: false });

    // segunda importação do mesmo contêiner é duplicata
    expect((await send('POST', '/api/discovery/import', { ids: [id(1)] })).json().created).toBe(0);

    // a escolha explícita libera a rede privada só dos cards adicionados agora
    await send('POST', '/api/discovery/import', { ids: [id(2)], keepPrivate: true });
    const all = (await send('GET', '/api/services')).json() as {
      name: string;
      allowPrivate: boolean;
    }[];
    expect(all.find((s) => s.name === 'Sonarr')?.allowPrivate).toBe(true);
    expect(all.find((s) => s.name === 'jellyfin')?.allowPrivate).toBe(false);
  } finally {
    await done();
  }
});

it('devolve erro estável quando o Docker não responde', async () => {
  const { send, done } = setup({
    list: async () => {
      throw new InputError('docker-unavailable');
    },
  });
  try {
    const response = await send('GET', '/api/discovery');
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('docker-unavailable');
    expect((await send('POST', '/api/discovery/import', { ids: [id(1)] })).statusCode).toBe(502);
  } finally {
    await done();
  }
});

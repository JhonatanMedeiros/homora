import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { createDatabase } from '@homora/db';
import { createAuth } from './auth.js';
import { createApp } from './app.js';

it('define, troca e limpa as colunas de um grupo, e leva o valor na exportação e importação', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-group-columns-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  auth.setup('senha-para-testes');
  const cookie = `homora_session=${auth.login('senha-para-testes', 'test')}`;
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth);
  const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  try {
    const group = (await send('POST', '/api/groups', { name: 'Infra' })).json();
    expect(group.columns).toBeNull();

    const four = await send('PUT', `/api/groups/${group.id}/columns`, { columns: 4 });
    expect(four.json()).toMatchObject({ id: group.id, name: 'Infra', columns: 4 });
    expect((await send('GET', '/api/groups')).json()[0].columns).toBe(4);

    for (const bad of [0, 7, 2.5, '3', undefined])
      expect(
        (await send('PUT', `/api/groups/${group.id}/columns`, { columns: bad })).json().code,
      ).toBe('invalid-columns');
    expect((await send('PUT', `/api/groups/${group.id}/columns`, {})).statusCode).toBe(400);
    expect(
      (await send('PUT', `/api/groups/${group.id}/columns`, { columns: 2, x: 1 })).statusCode,
    ).toBe(400);
    expect((await send('PUT', '/api/groups/9999/columns', { columns: 2 })).json().code).toBe(
      'group-not-found',
    );
    expect((await send('PUT', '/api/groups/abc/columns', { columns: 2 })).statusCode).toBe(404);

    // renomear preserva as colunas
    await send('PUT', `/api/groups/${group.id}`, { name: 'Infraestrutura' });
    expect((await send('GET', '/api/groups')).json()[0]).toMatchObject({
      name: 'Infraestrutura',
      columns: 4,
    });

    await send('POST', '/api/services', {
      name: 'Proxmox',
      url: 'https://pve.example:8006',
      category: 'Infraestrutura',
      description: '',
    });
    const exported = (await send('GET', '/api/config/export?format=yaml')).body;
    expect(parse(exported).groups[0]).toMatchObject({ name: 'Infraestrutura', columns: 4 });

    // limpar tira a chave do arquivo
    const cleared = await send('PUT', `/api/groups/${group.id}/columns`, { columns: null });
    expect(cleared.json().columns).toBeNull();
    expect(
      'columns' in parse((await send('GET', '/api/config/export?format=yaml')).body).groups[0],
    ).toBe(false);

    // importação: grupo novo recebe as colunas; grupo existente não muda; valor inválido avisa
    const content = [
      'version: 1',
      'groups:',
      '  - name: Infraestrutura',
      '    columns: 5',
      '    services:',
      '      - name: Outro',
      '        url: https://outro.example',
      '  - name: Midia',
      '    columns: 3',
      '    services:',
      '      - name: Jellyfin',
      '        url: https://jellyfin.example',
      '  - name: Casa',
      '    columns: 99',
      '    services:',
      '      - name: HA',
      '        url: https://ha.example',
    ].join('\n');
    const preview = (await send('POST', '/api/config/import/preview', { content })).json();
    expect(
      preview.plan.issues.some(
        (issue: { code: string; path: string }) =>
          issue.code === 'columns-ignored' && issue.path === 'groups[2].columns',
      ),
    ).toBe(true);
    expect((await send('POST', '/api/config/import/apply', { content })).statusCode).toBe(200);
    const groups = (await send('GET', '/api/groups')).json() as {
      name: string;
      columns: number | null;
    }[];
    const byName = Object.fromEntries(groups.map((g) => [g.name, g.columns]));
    expect(byName).toEqual({ Infraestrutura: null, Midia: 3, Casa: null });
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

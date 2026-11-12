// @vitest-environment happy-dom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Agents } from './agents';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function Harness() {
  const [token, setToken] = useState('');
  return (
    <Agents
      services={[]}
      onApplied={() => {}}
      token={token}
      setToken={setToken}
      onSetupConnection={() => {}}
    />
  );
}

type Call = { url: string; method?: string; body?: string };
function mockApi(agents: unknown[] = []) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, method: init?.method, body: init?.body });
      if (url === '/api/agents' && init?.method === 'POST')
        return { ok: true, json: async () => ({ id: 'new', token: 'tok_ABC-123' }) };
      if (url === '/api/agents') return { ok: true, json: async () => agents };
      if (url === '/api/proposals')
        return {
          ok: true,
          json: async () => [
            {
              id: 'p1',
              author: 'a1',
              state: 'pending',
              expiresAt: Date.now() + 600_000,
              diff: JSON.stringify({ op: 'create', service: { name: 'Immich', url: 'http://x/' } }),
            },
          ],
        };
      return { ok: true, json: async () => ({}) };
    }),
  );
  return calls;
}
const active = {
  id: 'a1',
  name: 'Assistente',
  scopes: '["services:read","proposals:create"]',
  revokedAt: null,
  createdAt: Date.UTC(2026, 10, 10),
};

it('creates an agent in a dialog, then shows the token with a setup guide that includes it', async () => {
  const calls = mockApi([]);
  render(<Harness />);
  expect(await screen.findByText('Nenhum agente ainda.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Novo agente' }));
  const form = await screen.findByRole('dialog', { name: 'Novo agente' });
  fireEvent.change(within(form).getByLabelText('Nome do agente'), {
    target: { value: 'Casa' },
  });
  fireEvent.click(within(form).getByRole('button', { name: 'Criar agente' }));
  const post = await waitFor(() => {
    const call = calls.find((item) => item.url === '/api/agents' && item.method === 'POST');
    expect(call).toBeTruthy();
    return call as Call;
  });
  // The default profile suggests changes, not just reading.
  expect(JSON.parse(post.body ?? '{}')).toEqual({
    name: 'Casa',
    scopes: ['services:read', 'proposals:create', 'groups:propose'],
  });
  const dialog = await screen.findByRole('dialog', { name: 'Token de "Casa"' });
  expect(within(dialog).getByText('tok_ABC-123')).toBeTruthy();
  expect(dialog.textContent).toContain('HOMORA_AGENT_TOKEN=tok_ABC-123');
  // Done stays disabled until the token is acknowledged.
  const done = within(dialog).getByRole('button', { name: 'Concluir' });
  expect((done as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Já guardei o token' }));
  expect((done as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(done);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Token de/ })).toBeNull());
});

it('asks before closing the token dialog without confirming the token was saved', async () => {
  mockApi([]);
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Criar o primeiro agente' }));
  const form = await screen.findByRole('dialog', { name: 'Novo agente' });
  fireEvent.change(within(form).getByLabelText('Nome do agente'), { target: { value: 'Casa' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Criar agente' }));
  await screen.findByRole('dialog', { name: 'Token de "Casa"' });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  const confirm = await screen.findByRole('alertdialog', { name: 'Fechar sem guardar o token?' });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Voltar' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getByRole('dialog', { name: 'Token de "Casa"' })).toBeTruthy();
});

it('lets a custom profile choose each permission', async () => {
  const calls = mockApi([]);
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Novo agente' }));
  const form = await screen.findByRole('dialog', { name: 'Novo agente' });
  fireEvent.click(within(form).getByLabelText(/Personalizado/));
  fireEvent.click(within(form).getByLabelText('Criar propostas'));
  fireEvent.click(within(form).getByLabelText('Ler recursos do Proxmox'));
  fireEvent.change(within(form).getByLabelText('Nome do agente'), { target: { value: 'X' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Criar agente' }));
  await waitFor(() => {
    const post = calls.find((item) => item.url === '/api/agents' && item.method === 'POST');
    expect(JSON.parse(post?.body ?? '{}').scopes).toEqual([
      'services:read',
      'groups:propose',
      'proxmox:read',
    ]);
  });
});

it('shows each agent with pending proposals and confirms before rotating or revoking', async () => {
  const calls = mockApi([active]);
  render(<Harness />);
  expect(await screen.findByText('1 pendentes')).toBeTruthy();
  expect(screen.getByText(/Criado em/)).toBeTruthy();
  const open = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: 'Opções de Assistente' }), {
      key: 'Enter',
    });
  open();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Gerar novo token' }));
  const rotate = await screen.findByRole('alertdialog');
  expect(within(rotate).getByText(/para de funcionar na hora/)).toBeTruthy();
  fireEvent.click(within(rotate).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(calls.some((call) => call.url.endsWith('/rotate'))).toBe(false);
  open();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Revogar' }));
  const revoke = await screen.findByRole('alertdialog');
  fireEvent.click(within(revoke).getByRole('button', { name: 'Revogar' }));
  await waitFor(() =>
    expect(
      calls.some((call) => call.url === '/api/agents/a1/revoke' && call.method === 'POST'),
    ).toBe(true),
  );
});

it('opens the setup guide any time, with a token placeholder and a remembered folder', async () => {
  mockApi([active]);
  render(<Harness />);
  await screen.findByRole('button', { name: 'Opções de Assistente' });
  fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Conectar um agente' });
  expect(dialog.textContent).toContain('COLE_O_TOKEN_AQUI');
  fireEvent.change(within(dialog).getByLabelText('Pasta do Homora neste computador'), {
    target: { value: '/srv/homora' },
  });
  expect(dialog.textContent).toContain('/srv/homora/apps/backend/dist/mcp-server.js');
  expect(localStorage.getItem('homora-agent-folder')).toBe('/srv/homora');
  fireEvent.mouseDown(within(dialog).getByRole('tab', { name: 'Codex' }), { button: 0 });
  await waitFor(() => expect(dialog.textContent).toContain('[mcp_servers.homora]'));
});

it('shows a token returned by an identity proposal review', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/agents') return { ok: true, json: async () => [active] };
      if (url === '/api/proposals')
        return {
          ok: true,
          json: async () => [
            {
              id: 'p1',
              author: 'a1',
              state: 'pending',
              expiresAt: Date.now() + 60000,
              diff: JSON.stringify({
                kind: 'agent',
                change: { op: 'create', name: 'Child', scopes: ['services:read'] },
                before: null,
              }),
            },
          ],
        };
      return {
        ok: true,
        json: async () => ({ state: 'approved', agentId: 'child', token: 'one-time-example' }),
      };
    }),
  );
  render(<Harness />);
  expect(await screen.findByText(/Alteração de identidade de agente/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar e aplicar' }));
  const dialog = await screen.findByRole('dialog', { name: /Token de/ });
  expect(within(dialog).getByText('one-time-example')).toBeTruthy();
});

it('reviews a batch together and explains conflicting changes', async () => {
  const proposals = [1, 2, 3].map((n) => ({
    id: `p${n}`,
    author: 'a1',
    batchId: 'batch',
    state: 'pending',
    expiresAt: Date.now() + 600_000,
    diff: JSON.stringify({ op: 'create', service: { name: `Card ${n}`, url: 'http://x/' } }),
  }));
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/agents') return { ok: true, json: async () => [active] };
    if (url === '/api/proposals') return { ok: true, json: async () => proposals };
    return { ok: false, json: async () => ({ code: 'batch-conflict' }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aprovar lote' }));
  expect(await screen.findByText(/As alterações do lote entram em conflito/)).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/proposal-batches/batch/review',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ approve: true }) }),
  );
  expect(screen.queryByRole('button', { name: 'Aprovar e aplicar' })).toBeNull();
});

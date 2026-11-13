import { Toaster, toast } from 'sonner';
// @vitest-environment happy-dom
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Agents } from './agents';

beforeEach(() => {
  render(<Toaster />);
});

afterEach(() => {
  toast.dismiss();
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

const openAgents = async () =>
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^Agentes/ }));

it('loads agents and proposals once on the initial render', async () => {
  const calls = mockApi([]);
  render(<Harness />);
  await waitFor(() => {
    expect(calls.filter((call) => call.url === '/api/agents')).toHaveLength(1);
    expect(calls.filter((call) => call.url === '/api/proposals')).toHaveLength(1);
  });
});

it('creates an agent in a dialog, then shows the token with a setup guide that includes it', async () => {
  const calls = mockApi([]);
  render(<Harness />);
  await openAgents();
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
  await openAgents();
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
  fireEvent.click(within(form).getByRole('radio', { name: /Personalizado/ }));
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
  await openAgents();
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
  await openAgents();
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

it('moves a pending proposal to expired at its deadline without reloading', async () => {
  const now = Date.now();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/agents') return { ok: true, json: async () => [] };
      if (url === '/api/proposal-settings')
        return { ok: true, json: async () => ({ ttlMinutes: 15 }) };
      return {
        ok: true,
        json: async () => [
          { id: 'p', author: 'a', state: 'pending', expiresAt: now + 120, diff: '{}' },
        ],
      };
    }),
  );
  render(<Harness />);
  expect(await screen.findByText(/Expira em 1 s/)).toBeTruthy();
  const toggle = await screen.findByRole('button', { name: 'Expiradas (1)' }, { timeout: 2000 });
  // Expired proposals stay collapsed so a long backlog does not push the page down.
  expect(screen.queryByRole('button', { name: 'Recriar' })).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Recriar' })).toBeTruthy();
});

it('keeps revoked agents collapsed and counts only active agents', async () => {
  mockApi([active, { ...active, id: 'old', name: 'Antigo', revokedAt: Date.now() }]);
  render(<Harness />);
  await openAgents();
  expect(screen.getByRole('tab', { name: 'Agentes 1' })).toBeTruthy();
  expect(screen.getByText('Assistente')).toBeTruthy();
  expect(screen.queryByText('Antigo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Agentes revogados (1)' }));
  expect(screen.getByText('Antigo')).toBeTruthy();
});

it('shows an empty active list when all agents are revoked', async () => {
  mockApi([{ ...active, revokedAt: Date.now() }]);
  render(<Harness />);
  await openAgents();
  expect(screen.getByText('Nenhum agente ativo.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Agentes revogados (1)' })).toBeTruthy();
});

function reviewApi(review: () => unknown, diff: unknown) {
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
              diff: JSON.stringify(diff),
            },
          ],
        };
      return review();
    }),
  );
}
const cardDiff = { op: 'create', service: { name: 'Immich', url: 'http://x/' } };

it('names the token dialog after the identity the proposal creates', async () => {
  reviewApi(
    () => ({ ok: true, json: async () => ({ state: 'approved', agentId: 'new', token: 'tok' }) }),
    { kind: 'agent', change: { op: 'create', name: 'Child', scopes: ['services:read'] } },
  );
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aprovar e aplicar' }));
  expect(await screen.findByRole('dialog', { name: 'Token de "Child"' })).toBeTruthy();
});

it('does not blame expiry or a configuration change for a server or network failure', async () => {
  reviewApi(() => ({ ok: false, status: 500, json: async () => ({ code: 'internal' }) }), cardDiff);
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aprovar e aplicar' }));
  expect(await screen.findByText(/Não foi possível concluir a revisão/)).toBeTruthy();
  cleanup();
  reviewApi(() => Promise.reject(new TypeError('offline')), cardDiff);
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aprovar e aplicar' }));
  expect(await screen.findByText(/Não foi possível concluir a revisão/)).toBeTruthy();
});

it('still reports an expired or changed proposal for a conflict', async () => {
  reviewApi(
    () => ({ ok: false, status: 409, json: async () => ({ code: 'config-changed' }) }),
    cardDiff,
  );
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aprovar e aplicar' }));
  expect(await screen.findByText(/configuração mudou|configuração foi alterada/i)).toBeTruthy();
});

it('returns keyboard focus to the proposals panel and refreshes the menu count after a review', async () => {
  const changed = vi.fn();
  window.addEventListener('homora:proposals-changed', changed);
  reviewApi(() => ({ ok: true, json: async () => ({ state: 'rejected' }) }), cardDiff);
  render(<Harness />);
  const reject = await screen.findByRole('button', { name: 'Rejeitar' });
  reject.focus();
  const before = changed.mock.calls.length;
  fireEvent.click(reject);
  await screen.findByText('Proposta rejeitada.');
  await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('tabpanel'));
  expect(changed.mock.calls.length).toBeGreaterThan(before);
  window.removeEventListener('homora:proposals-changed', changed);
});

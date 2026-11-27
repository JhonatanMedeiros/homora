// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { App } from './App';

afterEach(() => {
  cleanup();
  toast.dismiss();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

type Item = {
  id: string;
  name: string;
  state?: string;
  diff?: unknown;
  staleReason?: string;
};

/** An API whose list shrinks as proposals are decided, like the real one. */
function setup(items: Item[]) {
  let proposals = items.map((item, index) => ({
    id: item.id,
    author: 'a1',
    state: item.state ?? 'pending',
    staleReason: item.staleReason,
    expiresAt: Date.now() + 600_000,
    createdAt: 1000 - index,
    diff: JSON.stringify(
      item.diff ?? {
        op: 'create',
        service: { name: item.name, url: 'http://x.local/', category: 'Mídia' },
      },
    ),
  }));
  const gate: { release?: () => void; hold: boolean } = { hold: false };
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/agents')
      return {
        ok: true,
        json: async () => [
          { id: 'a1', name: 'Assistente', scopes: '["services:read"]', revokedAt: null },
        ],
      };
    if (url === '/api/proposals') return { ok: true, json: async () => proposals };
    const refresh = /^\/api\/proposals\/(\w+)\/refresh$/.exec(url);
    if (refresh && init?.method === 'POST') {
      calls.push(`refresh:${refresh[1]}`);
      proposals = proposals.map((p) =>
        p.id === refresh[1] ? { ...p, state: 'pending', staleReason: undefined } : p,
      );
      return { ok: true, json: async () => ({}) };
    }
    const review = /^\/api\/proposals\/(\w+)\/(review|undo)$/.exec(url);
    if (review && init?.method === 'POST') {
      calls.push(`${review[2]}:${review[1]}${init.body ? ':' + String(init.body) : ''}`);
      if (gate.hold) await new Promise<void>((resolve) => (gate.release = resolve));
      proposals = proposals.map((p) =>
        p.id === review[1]
          ? {
              ...p,
              state:
                review[2] === 'undo'
                  ? 'pending'
                  : JSON.parse(String(init.body)).approve
                    ? 'approved'
                    : 'rejected',
            }
          : p,
      );
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, gate };
}

async function openProposals() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Tudo em seu lugar.' });
  fireEvent.keyDown(screen.getByRole('button', { name: /Menu da conta de/ }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: /^Agentes/,
    }),
  );
}
const approveButtons = () => screen.queryAllByRole('button', { name: /Aprovar e aplicar/ });

it('applies each approval to the card that was on screen, as the list changes', async () => {
  const { calls } = setup([
    { id: 'p1', name: 'Um' },
    { id: 'p2', name: 'Dois' },
    { id: 'p3', name: 'Tres' },
  ]);
  await openProposals();
  await screen.findAllByText('Adicionar “Um”');
  // The queue keeps the order the proposals were created, whatever was decided before.
  const queue = screen.getByRole('list', { name: 'Propostas aguardando revisão' });
  const titles = () =>
    within(queue)
      .getAllByRole('button')
      .map((node) => /Adicionar “\w+”/.exec(node.textContent ?? '')?.[0]);
  expect(titles()).toEqual(['Adicionar “Um”', 'Adicionar “Dois”', 'Adicionar “Tres”']);
  fireEvent.click(approveButtons()[0]);
  await waitFor(() => expect(screen.queryAllByText('Adicionar “Um”')).toHaveLength(0));
  fireEvent.click(approveButtons()[0]);
  await waitFor(() => expect(screen.queryAllByText('Adicionar “Dois”')).toHaveLength(0));
  fireEvent.click(approveButtons()[0]);
  await waitFor(() => expect(screen.queryAllByText('Adicionar “Tres”')).toHaveLength(0));
  expect(calls).toEqual([
    'review:p1:{"approve":true}',
    'review:p2:{"approve":true}',
    'review:p3:{"approve":true}',
  ]);
});

it('sends one decision for a double click and locks the other cards meanwhile', async () => {
  const { calls, gate } = setup([
    { id: 'p1', name: 'Um' },
    { id: 'p2', name: 'Dois' },
  ]);
  await openProposals();
  await screen.findAllByText('Adicionar “Um”');
  gate.hold = true;
  const first = approveButtons()[0];
  fireEvent.click(first);
  fireEvent.click(first);
  // Nothing else can be decided while one decision is in flight.
  fireEvent.click(screen.getByRole('button', { name: /Rejeitar/ }));
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(approveButtons().every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  gate.hold = false;
  gate.release?.();
  await waitFor(() => expect(screen.queryAllByText('Adicionar “Um”')).toHaveLength(0));
  expect(calls).toEqual(['review:p1:{"approve":true}']);
});

it('keeps the approve button in place, disabled, when a proposal turns stale', async () => {
  setup([{ id: 'p1', name: 'Um', state: 'stale' }]);
  await openProposals();
  await screen.findAllByText('Adicionar “Um”');
  const [approve] = approveButtons() as HTMLButtonElement[];
  expect(approve.disabled).toBe(true);
  const reject = screen.getByRole('button', { name: /Rejeitar/ });
  expect(approve.compareDocumentPosition(reject) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  expect(screen.getByText(/Desatualizada: a configuração mudou/)).toBeTruthy();
});

it('asks before applying a destructive proposal when it is not held', async () => {
  const { calls } = setup([{ id: 'p1', name: 'Um', diff: { op: 'delete', id: 7 } }]);
  await openProposals();
  fireEvent.click(await screen.findByRole('button', { name: /Segure para aprovar/ }));
  expect(calls).toEqual([]);
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sim, aplicar' }));
  await waitFor(() => expect(calls).toEqual(['review:p1:{"approve":true}']));
});

it('undoes a rejection from the toast', async () => {
  const { calls } = setup([{ id: 'p1', name: 'Um' }]);
  await openProposals();
  await screen.findAllByText('Adicionar “Um”');
  fireEvent.click(screen.getByRole('button', { name: /Rejeitar/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
  await waitFor(() => expect(calls).toEqual(['review:p1:{"approve":false}', 'undo:p1']));
  expect(await screen.findAllByText('Adicionar “Um”')).toBeTruthy();
  expect(approveButtons()).toHaveLength(1);
});

it('explains why a stale proposal is blocked and refreshes it to approve', async () => {
  const { calls } = setup([
    { id: 'p1', name: 'Um', state: 'stale', staleReason: 'config-changed' },
  ]);
  await openProposals();
  await screen.findAllByText('Adicionar “Um”');
  expect(screen.getByText(/A configuração mudou depois da proposta/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Atualizar proposta/ }));
  await waitFor(() => expect(calls).toEqual(['refresh:p1']));
  await waitFor(() => expect((approveButtons()[0] as HTMLButtonElement).disabled).toBe(false));
});

it('offers to withdraw a stale proposal whose target is gone', async () => {
  setup([{ id: 'p1', name: 'Um', state: 'stale', staleReason: 'target-gone' }]);
  await openProposals();
  await screen.findByText(/O alvo não existe mais/);
  expect(screen.getByRole('button', { name: /Retirar/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Atualizar proposta/ })).toBeNull();
});

it('asks before refreshing a destructive stale proposal', async () => {
  const { calls } = setup([
    {
      id: 'p1',
      name: 'Um',
      diff: { op: 'delete', id: 7 },
      state: 'stale',
      staleReason: 'config-changed',
    },
  ]);
  await openProposals();
  fireEvent.click(await screen.findByRole('button', { name: /Atualizar proposta/ }));
  expect(calls).toEqual([]);
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Atualizar proposta' }));
  await waitFor(() => expect(calls).toEqual(['refresh:p1']));
});

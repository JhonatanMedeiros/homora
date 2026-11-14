// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProposalCard } from './proposal-card';
import { connectionDraft } from '@/features/connections/connection-model';

afterEach(cleanup);
it('shows security-relevant card settings for review', () => {
  const proposal = {
    id: 'p',
    author: 'a',
    state: 'pending',
    expiresAt: Date.now() + 60000,
    diff: JSON.stringify({
      op: 'create',
      service: {
        name: 'Example',
        url: 'https://example.test',
        category: 'Home',
        position: 0,
        allowPrivate: true,
        checkInsecure: true,
        checkType: 'ping',
        checkInterval: 30,
      },
    }),
  };
  render(
    <ProposalCard
      proposal={proposal}
      agentName="Agent"
      onReview={() => {}}
      onSetupConnection={() => {}}
    />,
  );
  // The changes are always shown in full, and the risk is named.
  expect(screen.getAllByText('Permitir monitoramento em rede privada')).toHaveLength(1);
  expect(screen.getByText('Atenção')).toBeTruthy();
  expect(screen.getAllByText('true')).toHaveLength(2);
  expect(screen.getAllByText('Ignorar validação TLS para este serviço').length).toBeGreaterThan(0);
  expect(screen.getByText('ping')).toBeTruthy();
  expect(screen.getByText('30')).toBeTruthy();
});
it('shows the exact suggested connection and opens setup only after approval', () => {
  const change = {
    type: 'home-assistant',
    name: 'Casa <script>',
    url: 'https://home.example',
    entityId: 'sensor.temp',
  };
  const proposal = {
    id: 'p',
    author: 'a',
    state: 'approved',
    expiresAt: Date.now(),
    diff: JSON.stringify({
      kind: 'managed',
      change: { kind: 'connection-setup', change },
      before: null,
    }),
  };
  const open = vi.fn();
  const { container } = render(
    <ProposalCard
      proposal={proposal}
      agentName="Agent"
      onReview={() => {}}
      onSetupConnection={open}
    />,
  );
  expect(screen.getByText(/A conexão só será criada/)).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Completar configuração da conexão' }));
  expect(open).toHaveBeenCalledWith(change);
  const { entityId, ...rest } = change as typeof change & { entityId: string };
  expect(connectionDraft(change)).toMatchObject({
    ...rest,
    values: { entityId },
    allowPrivate: false,
    secret: '',
    ca: '',
  });
  expect(connectionDraft({ ...change, url: 'https://user:pass@example.test' })).toBeNull();
});

it('shows the target and requested permissions before an identity decision', () => {
  const proposal = {
    id: 'p',
    author: 'a',
    state: 'pending',
    expiresAt: Date.now() + 60000,
    batchId: 'batch',
    diff: JSON.stringify({
      kind: 'agent',
      change: { op: 'update-scopes', id: 'target', scopes: ['agents:propose'] },
      before: { name: 'Child', scopes: ['services:read'] },
    }),
  };
  render(
    <ProposalCard
      proposal={proposal}
      agentName="Agent"
      onReview={() => {}}
      onSetupConnection={() => {}}
    />,
  );
  expect(screen.getByText(/Alteração de identidade de agente/)).toBeTruthy();
  expect(screen.getByText(/update-scopes/).textContent).toContain('agents:propose');
  expect(screen.getByText(/update-scopes/).textContent).toContain('services:read');
  expect(screen.getByText(/Revise todas as alterações antes de decidir/)).toBeTruthy();
});

it('shows the remaining seconds and an expired proposal with a recreate action', () => {
  const proposal = { id: 'p', author: 'a', state: 'pending', expiresAt: 130_000, diff: '{}' };
  const recreate = vi.fn();
  const { rerender } = render(
    <ProposalCard
      proposal={proposal}
      agentName="Agent"
      now={100_000}
      onReview={() => {}}
      onSetupConnection={() => {}}
    />,
  );
  expect(screen.getByText(/Expira em 30 s/)).toBeTruthy();
  rerender(
    <ProposalCard
      proposal={{ ...proposal, state: 'expired' }}
      agentName="Agent"
      now={130_000}
      onReview={() => {}}
      onSetupConnection={() => {}}
      onRecreate={recreate}
    />,
  );
  expect(screen.getByText('O prazo de revisão terminou.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Recriar' }));
  expect(recreate).toHaveBeenCalledOnce();
});

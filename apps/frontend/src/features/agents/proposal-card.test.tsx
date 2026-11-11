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
  expect(screen.getByText('Permitir monitoramento em rede privada')).toBeTruthy();
  expect(screen.getByText('true')).toBeTruthy();
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
  expect(connectionDraft(change)).toMatchObject({
    ...change,
    allowPrivate: false,
    secret: '',
    ca: '',
  });
  expect(connectionDraft({ ...change, url: 'https://user:pass@example.test' })).toBeNull();
});

// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Proposal } from './agent-model';
import { ReviewInbox } from './review-inbox';
import { reviewEntries } from './review-model';

afterEach(cleanup);

const proposal = (id: string, diff: unknown, extra: Partial<Proposal> = {}): Proposal => ({
  id,
  author: 'a1',
  state: 'pending',
  expiresAt: Date.now() + 600_000,
  diff: JSON.stringify(diff),
  ...extra,
});
const add = (name: string) => ({ op: 'create', service: { name, url: 'http://x/' } });
const waiting = [
  proposal('p1', add('Um')),
  proposal('p2', { op: 'delete', id: 7 }),
  proposal('p3', add('Tres')),
];

function inbox(pending: Proposal[], onReview = vi.fn(), onApproveMany = vi.fn()) {
  return (
    <ReviewInbox
      pending={pending}
      agentName={() => 'Assistente'}
      serviceFor={() => undefined}
      onReview={onReview}
      onApproveMany={onApproveMany}
      renderProposal={(p) => <p>Detalhe {p.id}</p>}
      renderBatchItem={(p) => <li key={p.id}>Item {p.id}</li>}
    />
  );
}
function setup(pending: Proposal[] = waiting) {
  const onReview = vi.fn();
  const onApproveMany = vi.fn();
  const view = render(inbox(pending, onReview, onApproveMany));
  return { onReview, onApproveMany, view };
}
const queue = () => screen.getByRole('list', { name: 'Propostas aguardando revisão' });

it('groups the batches into one entry and ranks them by their riskiest change', () => {
  const entries = reviewEntries([
    proposal('a', add('A'), { batchId: 'b' }),
    proposal('b', { op: 'delete', id: 1 }, { batchId: 'b' }),
    proposal('c', add('C')),
  ]);
  expect(entries.map((entry) => [entry.key, entry.risk])).toEqual([
    ['batch:b', 'destructive'],
    ['c', 'low'],
  ]);
});

it('shows the first proposal and moves through the queue with J and K', () => {
  setup();
  expect(screen.getByText('Detalhe p1')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'j' });
  expect(screen.getByText('Detalhe p2')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'j' });
  fireEvent.keyDown(window, { key: 'j' });
  expect(screen.getByText('Detalhe p3')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'k' });
  expect(screen.getByText('Detalhe p2')).toBeTruthy();
});

it('selects from the queue and rejects the selected proposal with R', () => {
  const { onReview } = setup();
  fireEvent.click(within(queue()).getByRole('button', { name: /Adicionar “Tres”/ }));
  expect(screen.getByText('Detalhe p3')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'r' });
  expect(onReview).toHaveBeenCalledWith('p3', false, false);
});

it('ignores the shortcuts while typing', () => {
  const { onReview } = setup();
  const field = document.body.appendChild(document.createElement('input'));
  fireEvent.keyDown(field, { key: 'r' });
  expect(onReview).not.toHaveBeenCalled();
  field.remove();
});

it('filters the queue by risk and falls back to everything when a filter empties', () => {
  setup();
  fireEvent.click(screen.getByRole('radio', { name: 'Atenção 1' }));
  expect(within(queue()).getAllByRole('button')).toHaveLength(1);
  expect(screen.getByText('Detalhe p2')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Baixo risco 2' }));
  expect(within(queue()).getAllByRole('button')).toHaveLength(2);
});

it('approves the routine proposals together after confirming, never the risky one', () => {
  const { onApproveMany } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar baixo risco (2)' }));
  const dialog = screen.getByRole('alertdialog');
  expect(onApproveMany).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Aprovar baixo risco (2)' }));
  expect(onApproveMany).toHaveBeenCalledWith(['p1', 'p3']);
});

it('moves on to the next proposal when the selected one is decided', () => {
  const { view } = setup();
  fireEvent.keyDown(window, { key: 'j' });
  expect(screen.getByText('Detalhe p2')).toBeTruthy();
  view.rerender(inbox([waiting[0], waiting[2]]));
  expect(screen.getByText('Detalhe p3')).toBeTruthy();
  view.rerender(inbox([waiting[0]]));
  expect(screen.getByText('Detalhe p1')).toBeTruthy();
});

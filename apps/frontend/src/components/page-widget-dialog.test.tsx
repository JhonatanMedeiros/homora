// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { PageWidgetDialog, type WidgetDraft } from '@/components/page-widget-dialog';
import { setLocale } from '@/i18n';

beforeEach(() => {
  setLocale('pt-BR');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]')),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog(draft: WidgetDraft) {
  return render(
    <PageWidgetDialog
      draft={draft}
      chosen={true}
      connections={[]}
      pages={[{ id: 1, name: 'Home', position: 0, groups: 0 }]}
      busy={false}
      error=""
      onChange={vi.fn()}
      onChoose={vi.fn()}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

it('renders a live generic preview for widgets without a custom Preview', async () => {
  renderDialog({
    id: null,
    pageId: 1,
    type: 'note',
    name: 'Minha nota',
    config: { text: 'Lembrar do backup' },
    connectionId: null,
    size: 'normal',
  });

  const preview = screen.getByLabelText('Prévia');
  expect(within(preview).getByText('Minha nota')).toBeTruthy();
  expect(await within(preview).findByText('Lembrar do backup')).toBeTruthy();
});

it('shows an incomplete hint in the preview until required options are valid', () => {
  const { rerender } = renderDialog({
    id: null,
    pageId: 1,
    type: 'countdown',
    name: 'Lançamento',
    config: { eventName: '', localDateTime: '', timeZone: '', pastBehavior: 'keep' },
    connectionId: null,
    size: 'normal',
  });

  const preview = screen.getByLabelText('Prévia');
  expect(
    within(preview).getByText('Preencha as opções obrigatórias para ver a prévia.'),
  ).toBeTruthy();

  rerender(
    <PageWidgetDialog
      draft={{
        id: null,
        pageId: 1,
        type: 'countdown',
        name: 'Lançamento',
        config: {
          eventName: 'Lançamento',
          localDateTime: '2030-01-01T12:00',
          timeZone: '',
          pastBehavior: 'keep',
        },
        connectionId: null,
        size: 'normal',
      }}
      chosen={true}
      connections={[]}
      pages={[{ id: 1, name: 'Home', position: 0, groups: 0 }]}
      busy={false}
      error=""
      onChange={vi.fn()}
      onChoose={vi.fn()}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  expect(
    within(preview).queryByText('Preencha as opções obrigatórias para ver a prévia.'),
  ).toBeNull();
});

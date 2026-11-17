// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PageWidgets } from './page-widgets';
import { setLocale } from '@/i18n';

vi.mock('@/components/widget-ui-registry', () => {
  const entry = {
    name: 'Synthetic',
    description: 'Synthetic description',
    defaultConfig: { label: 'initial' },
    parse: (value: unknown) =>
      value && typeof value === 'object' && 'label' in value && typeof value.label === 'string'
        ? value
        : null,
    View: ({ config }: { config: { label: string } }) => <span>{config.label}</span>,
    Editor: ({
      config,
      onChange,
    }: {
      config: { label: string };
      onChange: (value: unknown) => void;
    }) => (
      <input
        aria-label="Synthetic label"
        value={config.label}
        onChange={(event) => onChange({ label: event.target.value })}
      />
    ),
    Gallery: () => <span>sample</span>,
  };
  return {
    getWidgetUI: (type: string) => (type === 'synthetic' ? entry : undefined),
    listWidgetUI: () => [['synthetic', entry]],
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders and saves a synthetic widget through the generic host', async () => {
  setLocale('en');
  const fetcher = vi.fn(async () => new Response('[]'));
  vi.stubGlobal('fetch', fetcher);
  render(<PageWidgets pageId={1} pages={[{ id: 1, name: 'Home', position: 0, groups: 0 }]} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
  fireEvent.click(await screen.findByRole('button', { name: /Synthetic description/ }));
  fireEvent.change(screen.getByLabelText('Synthetic label'), { target: { value: 'changed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      '/api/page-widgets',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          pageId: 1,
          type: 'synthetic',
          name: '',
          config: { label: 'changed' },
          connectionId: null,
        }),
      }),
    ),
  );
});

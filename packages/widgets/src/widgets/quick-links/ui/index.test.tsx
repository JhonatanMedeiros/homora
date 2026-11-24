// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { WidgetHostProvider } from '../../../ui/host.js';
import { Editor, View, widgetUI } from './index.js';
import type { QuickLinksConfig } from '../definition.js';

afterEach(cleanup);
const host = (children: React.ReactNode) => (
  <WidgetHostProvider
    value={{ locale: 'en', t: (key, params) => `${key}${params?.number ?? ''}`, wide: true }}
  >
    {children}
  </WidgetHostProvider>
);
it('renders the empty state and safe external links', () => {
  const { rerender } = render(host(<View config={{ title: '', links: [] }} />));
  expect(screen.getByText('pageWidgets.quickLinksEmpty')).toBeTruthy();
  rerender(
    host(
      <View
        config={{
          title: 'Useful',
          links: [
            { label: 'Example', url: 'https://example.test' },
            { label: 'Unsafe', url: 'javascript:alert(1)' },
          ],
        }}
      />,
    ),
  );
  const link = screen.getByRole('link', { name: 'Example' });
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull();
});
it('adds, edits, reorders and removes links', () => {
  function Fixture() {
    const [config, setConfig] = useState<QuickLinksConfig>({
      title: '',
      links: [
        { label: 'First', url: 'https://first.test' },
        { label: 'Second', url: 'https://second.test' },
      ],
    });
    return <Editor config={config} onChange={setConfig} />;
  }
  render(host(<Fixture />));
  fireEvent.click(screen.getByRole('button', { name: 'pageWidgets.quickLinksUp2' }));
  expect((screen.getByLabelText('pageWidgets.quickLinksLabel 1') as HTMLInputElement).value).toBe(
    'Second',
  );
  fireEvent.change(screen.getByLabelText('pageWidgets.quickLinksLabel 1'), {
    target: { value: 'Edited' },
  });
  expect((screen.getByLabelText('pageWidgets.quickLinksLabel 1') as HTMLInputElement).value).toBe(
    'Edited',
  );
  fireEvent.click(screen.getByRole('button', { name: 'pageWidgets.quickLinksRemove1' }));
  fireEvent.click(screen.getByRole('button', { name: 'pageWidgets.quickLinksAdd' }));
  expect(screen.getByText('pageWidgets.quickLinksInvalid')).toBeTruthy();
});

it.each([
  ['javascript:alert(1)', false],
  ['example.test', false],
  ['https://user:pass@example.test', false],
  ['https://example.test', true],
])('validates %s before submission', (url, valid) => {
  expect(widgetUI.canSubmit?.({ title: '', links: [{ label: 'Example', url }] })).toBe(valid);
});

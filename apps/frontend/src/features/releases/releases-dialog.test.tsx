// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReleasesDialog } from './releases-dialog';

afterEach(cleanup);
const releases = [
  {
    tag: 'v0.2.0',
    title: 'New',
    date: '2026-01-02T00:00:00Z',
    body: '### New features\n- Added a feature ([#4](https://github.com/JhonatanMedeiros/homora/pull/4))\n- [bad](javascript:alert(1))\n<img src=x onerror=alert(1)>',
  },
  { tag: 'v0.1.0', title: 'Old', date: '2026-01-01T00:00:00Z', body: '### Fixes\n- Previous fix' },
];
function show(status: 'loading' | 'ready' | 'error' = 'ready') {
  const retry = vi.fn();
  render(
    <ReleasesDialog
      open
      onOpenChange={() => {}}
      status={status}
      releases={status === 'ready' ? releases : []}
      currentTag="v0.1.0"
      retry={retry}
    />,
  );
  return retry;
}

it('shows release notes, safe GitHub links and paginates to the installed version', () => {
  show();
  expect(screen.getByText('New features')).toBeTruthy();
  expect(screen.getByRole('link', { name: '#4' }).getAttribute('href')).toContain('/pull/4');
  expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
  expect(document.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Próxima versão' }));
  expect(screen.getByText('Previous fix')).toBeTruthy();
  expect(screen.getByText('Instalada')).toBeTruthy();
});

it('filters release notes and provides a retry on error', () => {
  show();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar nas notas de versão' }), {
    target: { value: 'previous fix' },
  });
  expect(screen.getByText('Previous fix')).toBeTruthy();
  cleanup();
  const retry = show('error');
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('labels development examples and does not link to invented releases', () => {
  render(
    <ReleasesDialog
      open
      onOpenChange={() => {}}
      status="ready"
      releases={releases}
      currentTag="v0.1.0"
      demo
      retry={() => {}}
    />,
  );
  expect(screen.getByText(/Dados de exemplo para desenvolvimento/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: /v0.2.0/ })).toBeNull();
});

// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AuthPage } from './auth-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  'shows a release link on the auth page (configured: %s)',
  async (configured) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ version: '0.1.0', releaseTag: 'v0.1.0' })),
        ),
    );
    render(
      <AuthPage
        status={{ configured, authenticated: false }}
        error=""
        onSubmit={async () => false}
      />,
    );
    const link = await screen.findByRole('link', { name: 'Versão 0.1.0' });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/JhonatanMedeiros/homora/releases/tag/v0.1.0',
    );
  },
);

it('shows an unlinked version for builds without a release tag', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: '0.1.0', releaseTag: null }))),
  );
  render(
    <AuthPage
      status={{ configured: false, authenticated: false }}
      error=""
      onSubmit={async () => false}
    />,
  );
  expect(await screen.findByText('Versão 0.1.0')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Versão 0.1.0' })).toBeNull();
});

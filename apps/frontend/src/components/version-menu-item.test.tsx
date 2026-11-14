// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VersionMenuItem } from './version-menu-item';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function showVersion(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Account</DropdownMenuTrigger>
      <DropdownMenuContent>
        <VersionMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

it('links the release even if the health endpoint reports an unhealthy status', async () => {
  showVersion({ version: '0.1.0', releaseTag: 'v0.1.0' }, 503);
  const link = await screen.findByRole('menuitem', { name: 'Versão 0.1.0' });
  expect(link.getAttribute('href')).toBe(
    'https://github.com/JhonatanMedeiros/homora/releases/tag/v0.1.0',
  );
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
});

it('shows the version without a release link when no matching release tag is available', async () => {
  showVersion({ version: '0.1.0', releaseTag: 'v0.2.0' });
  expect(await screen.findByText('Versão 0.1.0')).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'Versão 0.1.0' })).toBeNull();
});

it('does not render invalid version data', async () => {
  showVersion({ version: '../invalid', releaseTag: '../invalid' });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByText(/Versão/)).toBeNull();
});

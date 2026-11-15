// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppShell } from '@/components/app-shell';

vi.mock('@/hooks/use-build-version', () => ({
  useBuildVersion: () => ({ version: '0.1.0', releaseTag: 'v0.1.0' }),
  releaseUrl: (tag: string) => `https://github.com/JhonatanMedeiros/homora/releases/tag/${tag}`,
}));
vi.mock('./use-release-feed', () => ({
  useReleaseFeed: () => ({
    status: 'ready',
    releases: [
      {
        tag: 'v0.2.0',
        title: 'New',
        date: '2026-01-02T00:00:00Z',
        body: '### News\n- Test update',
      },
    ],
    retry: () => {},
  }),
}));
afterEach(cleanup);

it('announces an available update and opens its notes from the profile menu', () => {
  render(
    <AppShell
      tab="services"
      managing={false}
      onManageChange={() => {}}
      onTabChange={() => {}}
      onLogout={() => {}}
      onOpenPalette={() => {}}
      profile={{ name: 'Alex', email: 'alex@example.test', twoFactorEnabled: false }}
    >
      <div>Dashboard</div>
    </AppShell>,
  );
  fireEvent.pointerDown(screen.getByRole('button', { name: /Atualização disponível/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole('menuitem', { name: /Novidades/ }));
  expect(screen.getByRole('dialog', { name: 'Novidades' })).toBeTruthy();
  expect(screen.getByText('Test update')).toBeTruthy();
});

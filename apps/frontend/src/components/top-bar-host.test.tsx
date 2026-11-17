// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TopBar } from './top-bar';

vi.mock('@/components/widget-ui-registry', () => ({
  TopBarWidget: () => <span>synthetic top-bar widget</span>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders the registry-provided slot without knowing its widget type', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]')),
  );
  render(<TopBar />);
  expect(screen.getByText('synthetic top-bar widget')).toBeTruthy();
});

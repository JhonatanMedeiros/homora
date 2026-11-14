// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomeProbes } from './home-probes';
import { setLocale } from '@/i18n';

afterEach(cleanup);

it('renders nothing without probes', () => {
  const { container } = render(<HomeProbes probes={[]} onOpen={() => {}} />);
  expect(container.firstChild).toBeNull();
});

it('says the state in words next to each probe and opens the probes screen', () => {
  setLocale('en');
  const onOpen = vi.fn();
  render(
    <HomeProbes
      probes={[
        { id: 1, name: 'Internet', state: 'available', label: 'Online', meta: '12 ms' },
        { id: 2, name: 'DNS', state: 'unavailable', label: 'Offline', meta: null },
      ]}
      onOpen={onOpen}
    />,
  );
  expect(screen.getByText(/Online/).textContent).toContain('12 ms');
  expect(screen.getByText('Offline')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /DNS/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Manage probes' }));
  expect(onOpen).toHaveBeenCalledTimes(2);
});

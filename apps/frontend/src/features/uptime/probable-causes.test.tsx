// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Service } from '@homora/shared';
import { ProbableCauses } from './probable-causes';

const service = (id: number, name: string) => ({ id, name }) as Service;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const expand = () => fireEvent.click(screen.getByRole('button', { expanded: false }));

it('renders nothing when no service is down', () => {
  const { container } = render(
    <ProbableCauses down={[]} impacts={new Map()} onOpen={() => undefined} />,
  );
  expect(container.firstChild).toBeNull();
});

it('says "likely" and opens the chosen service', () => {
  const onOpen = vi.fn();
  const down = [service(1, 'Plex'), service(2, 'Jellyfin')];
  render(
    <ProbableCauses
      down={down}
      impacts={
        new Map([
          [1, 'guest-stopped'],
          [2, 'guest-stopped'],
        ])
      }
      onOpen={onOpen}
    />,
  );
  // Collapsed by default: only the summary line takes room on the Home.
  expect(screen.queryByRole('button', { name: /Plex/ })).toBeNull();
  expand();
  expect(screen.getAllByText(/Likely cause|Causa provável/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /Plex/ }));
  expect(onOpen).toHaveBeenCalledWith(down[0]);
});

it('offers to acknowledge or mute a cause, and to bring acknowledged services back', () => {
  const onAcknowledge = vi.fn();
  const onShowAgain = vi.fn();
  const down = [service(1, 'Plex'), service(2, 'Jellyfin')];
  const quiet = [service(3, 'Grafana')];
  render(
    <ProbableCauses
      down={down}
      quiet={quiet}
      impacts={new Map()}
      onOpen={() => undefined}
      onAcknowledge={onAcknowledge}
      onShowAgain={onShowAgain}
    />,
  );
  expand();
  fireEvent.click(screen.getByRole('button', { name: 'Reconhecer' }));
  expect(onAcknowledge).toHaveBeenLastCalledWith(down);
  fireEvent.click(screen.getByRole('button', { name: 'Silenciar 1 h' }));
  expect(onAcknowledge).toHaveBeenLastCalledWith(down, 60);
  expect(screen.getByText(/Grafana/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar de novo' }));
  expect(onShowAgain).toHaveBeenCalledWith(quiet);
});

it('keeps a line for acknowledged services when nothing else is offline', () => {
  render(
    <ProbableCauses
      down={[]}
      quiet={[service(3, 'Grafana')]}
      impacts={new Map()}
      onOpen={() => undefined}
    />,
  );
  expect(screen.getByText(/Reconhecidos: 1/)).toBeTruthy();
});

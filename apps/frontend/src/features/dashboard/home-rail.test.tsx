// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomeRail } from './home-rail';

afterEach(cleanup);

const show = (extra: Partial<Parameters<typeof HomeRail>[0]> = {}) => {
  const props = {
    statusFilter: 'all' as const,
    counts: { all: 5, down: 2, degraded: 0, maintenance: 1, ok: 0, unmeasured: 0 },
    onStatusFilter: vi.fn(),
    groups: [
      { name: 'Media', total: 3, down: 2 },
      { name: 'Network', total: 2, down: 0 },
    ],
    selectedGroup: null,
    onSelectGroup: vi.fn(),
    favorites: { count: 2, active: false, onToggle: vi.fn() },
    widgetRail: true,
    onToggleWidgetRail: vi.fn(),
    ...extra,
  };
  render(<HomeRail {...props} />);
  return props;
};

it('keeps every status filter with its count, including degraded and maintenance', () => {
  const props = show();
  expect(screen.getByRole('button', { name: /Degradados|Degraded/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Manutenção|Maintenance/ }));
  expect(props.onStatusFilter).toHaveBeenCalledWith('maintenance');
});

it('lists groups with their health in words and selects one', () => {
  const props = show();
  const media = screen.getByRole('button', { name: /Media/ });
  expect(media.textContent).toMatch(/2/);
  expect(media.querySelector('.sr-only')).toBeTruthy();
  fireEvent.click(media);
  expect(props.onSelectGroup).toHaveBeenCalledWith('Media');
});

it('toggles the widget panel', () => {
  const props = show();
  fireEvent.click(screen.getByRole('button', { name: /widgets/i }));
  expect(props.onToggleWidgetRail).toHaveBeenCalled();
});

it('shows Favorites only when something is pinned, and toggles the view', () => {
  const props = show();
  fireEvent.click(screen.getByRole('button', { name: /Favoritos/ }));
  expect(props.favorites.onToggle).toHaveBeenCalled();
  cleanup();
  show({ favorites: { count: 0, active: false, onToggle: vi.fn() } });
  expect(screen.queryByRole('button', { name: /Favoritos/ })).toBeNull();
});

it('lists probes with their state in words and opens the probes screen', () => {
  const onOpen = vi.fn();
  show({
    probes: {
      items: [{ id: 7, name: 'WAN', state: 'unavailable', label: 'Offline' }],
      onOpen,
    },
  });
  const wan = screen.getByRole('button', { name: /WAN/ });
  expect(wan.textContent).toContain('Offline');
  fireEvent.click(wan);
  expect(onOpen).toHaveBeenCalled();
});

it('leaves the probes block out when there are none', () => {
  show({ probes: { items: [], onOpen: vi.fn() } });
  expect(screen.queryByRole('region', { name: 'Probes' })).toBeNull();
});

// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ServiceIcon } from './service-icon';
import { ICON_NAMES } from '@homora/shared';
import { iconKind, iconNames, iconRegistry } from '@/lib/icons';

afterEach(cleanup);

it('classifies icon format', () => {
  expect(iconKind('')).toBe('empty');
  expect(iconKind('lucide:server')).toBe('lucide');
  expect(iconKind('https://example.test/a.png')).toBe('image');
  expect(iconKind('🎬')).toBe('text');
});

it('renders built-in icon, emoji, image, and initial', () => {
  const { container, rerender } = render(<ServiceIcon icon="lucide:server" name="Proxmox" />);
  expect(container.querySelector('svg')).not.toBeNull();
  rerender(<ServiceIcon icon="🎬" name="Jellyfin" />);
  expect(container.textContent).toBe('🎬');
  rerender(<ServiceIcon icon="https://example.test/a.png" name="Jellyfin" />);
  const image = container.querySelector('img');
  expect(image?.getAttribute('src')).toBe('https://example.test/a.png');
  expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
  rerender(<ServiceIcon icon="" name="jellyfin" />);
  expect(container.textContent).toBe('J');
});

it('uses the initial when the name does not exist or image fails', () => {
  const { container, rerender } = render(<ServiceIcon icon="lucide:does-not-exist" name="Plex" />);
  expect(container.textContent).toBe('P');
  rerender(<ServiceIcon icon="https://example.test/broken.png" name="Plex" />);
  fireEvent.error(container.querySelector('img')!);
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toBe('P');
});

it('exposes only valid names in the registry', () => {
  expect(iconNames.length).toBeGreaterThan(50);
  for (const name of iconNames) {
    expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(iconRegistry[name]).toBeDefined();
  }
});

it('keeps UI registry in sync with shared server list', () => {
  expect([...iconNames].sort()).toEqual([...ICON_NAMES].sort());
});

it('renders bundled brand logo from local path', () => {
  const { container } = render(<ServiceIcon icon="brand:proxmox" name="Proxmox" />);
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/brand-icons/proxmox.svg');
});

it('falls back to initial if logo fails to load or name does not exist', () => {
  const failing = render(<ServiceIcon icon="brand:proxmox" name="Proxmox" />);
  fireEvent.error(failing.container.querySelector('img') as HTMLImageElement);
  expect(failing.container.textContent).toBe('P');
  cleanup();
  const unknown = render(<ServiceIcon icon="brand:inexistente" name="Home" />);
  expect(unknown.container.querySelector('img')).toBeNull();
  expect(unknown.container.textContent).toBe('H');
});

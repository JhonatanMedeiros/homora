// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ServiceIcon } from './service-icon';
import { ICON_NAMES } from '@homora/shared';
import { iconKind, iconNames, iconRegistry } from '@/lib/icons';

afterEach(cleanup);

it('classifica o formato do ícone', () => {
  expect(iconKind('')).toBe('empty');
  expect(iconKind('lucide:server')).toBe('lucide');
  expect(iconKind('https://exemplo.test/a.png')).toBe('image');
  expect(iconKind('🎬')).toBe('text');
});

it('desenha ícone embutido, emoji, imagem e a inicial', () => {
  const { container, rerender } = render(<ServiceIcon icon="lucide:server" name="Proxmox" />);
  expect(container.querySelector('svg')).not.toBeNull();
  rerender(<ServiceIcon icon="🎬" name="Jellyfin" />);
  expect(container.textContent).toBe('🎬');
  rerender(<ServiceIcon icon="https://exemplo.test/a.png" name="Jellyfin" />);
  const image = container.querySelector('img');
  expect(image?.getAttribute('src')).toBe('https://exemplo.test/a.png');
  expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
  rerender(<ServiceIcon icon="" name="jellyfin" />);
  expect(container.textContent).toBe('J');
});

it('usa a inicial quando o nome não existe ou a imagem falha', () => {
  const { container, rerender } = render(<ServiceIcon icon="lucide:nao-existe" name="Plex" />);
  expect(container.textContent).toBe('P');
  rerender(<ServiceIcon icon="https://exemplo.test/quebrada.png" name="Plex" />);
  fireEvent.error(container.querySelector('img')!);
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toBe('P');
});

it('expõe somente nomes válidos no registro', () => {
  expect(iconNames.length).toBeGreaterThan(50);
  for (const name of iconNames) {
    expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(iconRegistry[name]).toBeDefined();
  }
});

it('mantém o registro da interface igual à lista compartilhada com o servidor', () => {
  expect([...iconNames].sort()).toEqual([...ICON_NAMES].sort());
});

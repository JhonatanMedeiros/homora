import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { BRAND_ICON_NAMES } from '@homora/shared';
import { iconKind, suggestBrandIcon } from './icons';

const dir = resolve(__dirname, '../../public/brand-icons');

it('each listed logo exists as SVG and no unlisted files exist in directory', () => {
  const files = readdirSync(dir).filter((file) => file.endsWith('.svg'));
  expect(files.sort()).toEqual(BRAND_ICON_NAMES.map((name) => `${name}.svg`).sort());
  expect(readdirSync(dir).length).toBe(files.length);
});

it('SVGs are vector, compact, and free of scripts, embedded bitmaps, or external references', () => {
  for (const name of BRAND_ICON_NAMES) {
    const path = resolve(dir, `${name}.svg`);
    expect(existsSync(path), name).toBe(true);
    expect(statSync(path).size, name).toBeLessThan(100_000);
    const text = readFileSync(path, 'utf8');
    expect(text, name).toMatch(/<svg[\s>]/);
    expect(text, name).not.toMatch(/<script|<image|foreignObject|<iframe|javascript:|<!ENTITY/i);
    expect(text, name).not.toMatch(/\son[a-z]+\s*=/i);
    expect(text, name).not.toMatch(/href\s*=\s*["'](?!#)/i);
  }
});

it('suggests logo based on service name and identifies icon type', () => {
  expect(suggestBrandIcon('Proxmox')).toBe('proxmox');
  expect(suggestBrandIcon('Home Assistant')).toBe('home-assistant');
  expect(suggestBrandIcon('uptime kuma')).toBe('uptime-kuma');
  expect(suggestBrandIcon('Pi-hole')).toBe('pi-hole');
  expect(suggestBrandIcon('My Server')).toBeNull();
  expect(suggestBrandIcon('')).toBeNull();
  expect(iconKind('brand:plex')).toBe('brand');
  expect(iconKind('brand:inexistente')).toBe('empty');
});

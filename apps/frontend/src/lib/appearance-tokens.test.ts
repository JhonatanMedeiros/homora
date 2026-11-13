import { describe, expect, it } from 'vitest';
import {
  ACCENT_PRESETS,
  BACKGROUND_IDS,
  DEFAULT_APPEARANCE,
  type Appearance,
  type BackgroundImage,
} from '@homora/shared';
import { appearanceTokens } from './appearance-tokens.js';

const make = (patch: Partial<Appearance>): Appearance => ({ ...DEFAULT_APPEARANCE, ...patch });

const picture = (patch: Partial<BackgroundImage> = {}): BackgroundImage => ({
  name: 'a'.repeat(32) + '.webp',
  dim: 40,
  position: 'fill',
  average: '#808080',
  width: 1920,
  height: 1080,
  bytes: 120_000,
  originalBytes: 900_000,
  ...patch,
});

describe('appearanceTokens', () => {
  it('emits nothing for the default so the shipped look is untouched', () => {
    expect(appearanceTokens(DEFAULT_APPEARANCE)).toEqual({ light: {}, dark: {}, shared: {} });
  });

  it('emits accent, readable on-accent text, background and card tokens', () => {
    const tokens = appearanceTokens(
      make({ accent: 'violet', background: 'dusk', cardOpacity: 80, blur: true }),
    );
    expect(tokens.light['--ap-primary']).toBe(ACCENT_PRESETS.violet.light);
    expect(tokens.light['--ap-primary-foreground']).toBe('#ffffff');
    expect(tokens.dark['--ap-primary-foreground']).toBe('#000000');
    expect(tokens.light['--ap-page-background']).toContain('linear-gradient');
    expect(tokens.shared).toEqual({ '--ap-card-opacity': '0.8', '--ap-card-blur': 'blur(12px)' });
    for (const theme of ['light', 'dark'] as const)
      expect(tokens[theme]['--ap-accent-text']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('never emits an external url for preset backgrounds', () => {
    for (const background of BACKGROUND_IDS)
      expect(JSON.stringify(appearanceTokens(make({ background })))).not.toMatch(/url\(|https?:/);
  });

  it('lets the image replace the preset and only points at the same origin', () => {
    const tokens = appearanceTokens(
      make({ background: 'dusk', image: picture({ position: 'tile' }) }),
    );
    expect(tokens.light['--ap-page-background']).toContain(
      'url("/api/appearance/background/' + 'a'.repeat(32) + '.webp")',
    );
    expect(tokens.light['--ap-page-background']).not.toContain('linear-gradient(160deg');
    expect(tokens.shared['--ap-page-repeat']).toBe('no-repeat, repeat');
    expect(JSON.stringify(tokens)).not.toMatch(/https?:|\/\/[a-z]/);
  });
});

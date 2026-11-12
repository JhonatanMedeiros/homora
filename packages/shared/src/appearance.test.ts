import { describe, expect, it } from 'vitest';
import {
  ACCENT_IDS,
  ACCENT_PRESETS,
  BACKGROUND_IDS,
  BACKGROUND_PRESETS,
  DEFAULT_APPEARANCE,
  appearanceTokens,
  contrastProblems,
  contrastRatio,
  hexToRgb,
  onAccent,
  parseAppearance,
  type Appearance,
} from './appearance.js';

const make = (patch: Partial<Appearance>): Appearance => ({ ...DEFAULT_APPEARANCE, ...patch });

describe('contrast maths', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio(hexToRgb('#000000'), hexToRgb('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(hexToRgb('#777777'), hexToRgb('#ffffff'))).toBeCloseTo(4.48, 1);
  });
  it('picks the on-accent colour with the higher ratio', () => {
    expect(onAccent(hexToRgb('#fde68a'))).toBe('#000000');
    expect(onAccent(hexToRgb('#1e3a8a'))).toBe('#ffffff');
    for (const hex of ['#808080', '#767676', '#6d28d9', '#b45000']) {
      const picked = onAccent(hexToRgb(hex));
      expect(contrastRatio(hexToRgb(hex), hexToRgb(picked))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('contrast policy', () => {
  it('accepts the default', () => {
    expect(contrastProblems(DEFAULT_APPEARANCE)).toEqual([]);
  });

  it('accepts every preset on every background at full opacity', () => {
    for (const accent of ACCENT_IDS)
      for (const background of BACKGROUND_IDS)
        expect(
          contrastProblems(make({ accent, background })),
          `${accent} on ${background}`,
        ).toEqual([]);
  });

  it('accepts every background at the lowest opacity', () => {
    // Each background has a variant per theme, and the card is a mix of the page and the card
    // colour, so a page that keeps text readable keeps the translucent card readable too.
    for (const background of BACKGROUND_IDS)
      expect(contrastProblems(make({ background, cardOpacity: 60 })), background).toEqual([]);
  });

  it('rejects a background that does not adapt to the dark theme', () => {
    // Light sand in both themes: light text on it cannot be read, whatever the opacity.
    const stops = BACKGROUND_PRESETS['sand-light']!;
    const original = stops.dark;
    stops.dark = stops.light;
    try {
      const problems = contrastProblems(make({ background: 'sand-light', cardOpacity: 60 }));
      expect(problems.some((p) => p.theme === 'dark' && p.code === 'ink' && p.on === 'page')).toBe(
        true,
      );
    } finally {
      stops.dark = original;
    }
  });

  it('rejects a custom accent below 3:1 on the card in either theme', () => {
    const pale = contrastProblems(make({ accent: 'custom', customAccent: '#ffe066' }));
    expect(pale.some((p) => p.code === 'accent' && p.theme === 'light')).toBe(true);
    const near = contrastProblems(make({ accent: 'custom', customAccent: '#1a1a1a' }));
    expect(near.some((p) => p.code === 'accent' && p.theme === 'dark')).toBe(true);
    expect(contrastProblems(make({ accent: 'custom', customAccent: '#2f7d6b' }))).toEqual([]);
  });

  it('reports only the worst ratio per kind of problem', () => {
    const problems = contrastProblems(make({ accent: 'custom', customAccent: '#ffffff' }));
    const keys = problems.map((p) => `${p.code}:${p.theme}:${p.on}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps every preset at 3:1 on the plain card', () => {
    for (const pair of Object.values(ACCENT_PRESETS)) {
      expect(contrastRatio(hexToRgb(pair.light), hexToRgb('#ffffff'))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(hexToRgb(pair.dark), hexToRgb('#181513'))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('parseAppearance', () => {
  it('round-trips the default', () => {
    expect(parseAppearance(DEFAULT_APPEARANCE)).toEqual(DEFAULT_APPEARANCE);
  });
  it('normalises the custom accent to lower case', () => {
    expect(parseAppearance(make({ accent: 'custom', customAccent: '#2F7D6B' }))?.customAccent).toBe(
      '#2f7d6b',
    );
  });
  it.each([
    ['not an object', 'x'],
    ['an array', []],
    ['unknown field', { ...DEFAULT_APPEARANCE, extra: 1 }],
    ['wrong version', { ...DEFAULT_APPEARANCE, version: 2 }],
    ['unknown accent', { ...DEFAULT_APPEARANCE, accent: 'lime' }],
    ['custom without a colour', { ...DEFAULT_APPEARANCE, accent: 'custom' }],
    ['custom with a bad colour', { ...DEFAULT_APPEARANCE, accent: 'custom', customAccent: 'red' }],
    ['custom colour on a preset', { ...DEFAULT_APPEARANCE, customAccent: '#ffffff' }],
    ['unknown background', { ...DEFAULT_APPEARANCE, background: 'url(x)' }],
    ['opacity below range', { ...DEFAULT_APPEARANCE, cardOpacity: 55 }],
    ['opacity off step', { ...DEFAULT_APPEARANCE, cardOpacity: 62 }],
    ['opacity above range', { ...DEFAULT_APPEARANCE, cardOpacity: 105 }],
    ['opacity as text', { ...DEFAULT_APPEARANCE, cardOpacity: '80' }],
    ['blur as text', { ...DEFAULT_APPEARANCE, blur: 'yes' }],
  ])('rejects %s', (_name, input) => {
    expect(parseAppearance(input)).toBeNull();
  });
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
  it('never emits an external url', () => {
    for (const background of BACKGROUND_IDS)
      expect(JSON.stringify(appearanceTokens(make({ background })))).not.toMatch(/url\(|https?:/);
  });
});

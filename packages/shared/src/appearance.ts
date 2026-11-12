/**
 * Instance-wide appearance (accent, page background, card translucency) and the contrast
 * policy that gates it. Pure functions only: the backend validates with them before saving
 * and the UI runs the very same check live, so both always agree.
 */

export const APPEARANCE_VERSION = 1;
export const APPEARANCE_KEY = 'appearance';

export const ACCENT_IDS = ['ember', 'moss', 'sky', 'rose', 'violet', 'slate'] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export const BACKGROUND_IDS = [
  'flat',
  'dusk',
  'ember-glow',
  'forest',
  'ocean',
  'sand-light',
] as const;
export type BackgroundId = (typeof BACKGROUND_IDS)[number];

export const CARD_OPACITY_MIN = 60;
export const CARD_OPACITY_MAX = 100;
export const CARD_OPACITY_STEP = 5;

export type Appearance = {
  version: typeof APPEARANCE_VERSION;
  /** A preset id, or `custom` together with `customAccent`. */
  accent: AccentId | 'custom';
  /** `#rrggbb`; only meaningful (and only stored) when `accent` is `custom`. */
  customAccent: string | null;
  background: BackgroundId;
  /** Percent, 60 to 100 in steps of 5. */
  cardOpacity: number;
  blur: boolean;
};

export const DEFAULT_APPEARANCE: Appearance = {
  version: APPEARANCE_VERSION,
  accent: 'ember',
  customAccent: null,
  background: 'flat',
  cardOpacity: 100,
  blur: false,
};

export type ThemeName = 'light' | 'dark';

/** Mirrors the Lamplight tokens in `apps/frontend/src/style.css` as sRGB hex. */
export const THEME_SURFACES: Record<
  ThemeName,
  { background: string; card: string; ink: string; muted: string }
> = {
  light: { background: '#fbfaf7', card: '#ffffff', ink: '#1a1512', muted: '#635c57' },
  dark: { background: '#100e0c', card: '#181513', ink: '#f1eeea', muted: '#a39d98' },
};

type Pair = Record<ThemeName, string>;

/**
 * `ember` is the shipped look: it emits no override. Its pair is the accent as it appears on
 * the page (the `--accent-text` token), which is what the contrast check measures.
 */
export const ACCENT_PRESETS: Record<AccentId, Pair> = {
  ember: { light: '#b45000', dark: '#fb9f44' },
  moss: { light: '#4d7c0f', dark: '#a3c64a' },
  sky: { light: '#0369a1', dark: '#5cb8f0' },
  rose: { light: '#be185d', dark: '#f27fae' },
  violet: { light: '#6d28d9', dark: '#a78bfa' },
  slate: { light: '#475569', dark: '#94a3b8' },
};

/** `null` stops mean "the theme's own background" (no gradient). */
export const BACKGROUND_PRESETS: Record<BackgroundId, Record<ThemeName, string[]> | null> = {
  flat: null,
  dusk: { light: ['#ece8f5', '#f6e9ee'], dark: ['#15122a', '#2a1633'] },
  'ember-glow': { light: ['#fbefe1', '#f7e3d1'], dark: ['#1c1210', '#2b1608'] },
  forest: { light: ['#e8f0e4', '#dfeadb'], dark: ['#0e1a14', '#14261b'] },
  ocean: { light: ['#e4eef5', '#d9e8f2'], dark: ['#0b1622', '#0f2536'] },
  'sand-light': { light: ['#efe6d2', '#e9dec6'], dark: ['#1f1a12', '#2a2216'] },
};

/* ---------- colour maths (WCAG 2.2) ---------- */

export type Rgb = readonly [number, number, number];

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** `top` painted over `bottom` with the given opacity (0 to 1). */
export function blend(top: Rgb, bottom: Rgb, opacity: number): Rgb {
  return [0, 1, 2].map((i) => top[i]! * opacity + bottom[i]! * (1 - opacity)) as unknown as Rgb;
}

/** Text colour for a filled accent: whichever of white and black has the higher ratio (never below 4.5). */
export function onAccent(accent: Rgb): '#ffffff' | '#000000' {
  return contrastRatio(accent, [255, 255, 255]) >= contrastRatio(accent, [0, 0, 0])
    ? '#ffffff'
    : '#000000';
}

/* ---------- validation ---------- */

/** Parses untrusted data. Returns `null` for anything that is not a valid, canonical appearance. */
export function parseAppearance(input: unknown): Appearance | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const allowed = ['version', 'accent', 'customAccent', 'background', 'cardOpacity', 'blur'];
  if (Object.keys(raw).some((key) => !allowed.includes(key))) return null;
  if (raw.version !== APPEARANCE_VERSION) return null;
  const accent = raw.accent;
  if (accent !== 'custom' && !(ACCENT_IDS as readonly unknown[]).includes(accent)) return null;
  let customAccent: string | null = null;
  if (accent === 'custom') {
    if (!isHexColor(raw.customAccent)) return null;
    customAccent = raw.customAccent.toLowerCase();
  } else if (raw.customAccent !== undefined && raw.customAccent !== null) return null;
  if (!(BACKGROUND_IDS as readonly unknown[]).includes(raw.background)) return null;
  const opacity = raw.cardOpacity;
  if (
    typeof opacity !== 'number' ||
    !Number.isInteger(opacity) ||
    opacity < CARD_OPACITY_MIN ||
    opacity > CARD_OPACITY_MAX ||
    (opacity - CARD_OPACITY_MIN) % CARD_OPACITY_STEP !== 0
  )
    return null;
  if (typeof raw.blur !== 'boolean') return null;
  return {
    version: APPEARANCE_VERSION,
    accent: accent as Appearance['accent'],
    customAccent,
    background: raw.background as BackgroundId,
    cardOpacity: opacity,
    blur: raw.blur,
  };
}

/* ---------- contrast policy ---------- */

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_NON_TEXT_CONTRAST = 3;

export type ContrastProblem = {
  /** Stable code; the UI turns it into a sentence. */
  code: 'accent' | 'ink' | 'muted';
  theme: ThemeName;
  /** The surface the colour sits on. */
  on: 'card' | 'page';
  ratio: number;
  required: number;
};

export const accentFor = (appearance: Appearance, theme: ThemeName): string =>
  appearance.accent === 'custom'
    ? (appearance.customAccent ?? ACCENT_PRESETS.ember[theme])
    : ACCENT_PRESETS[appearance.accent][theme];

/** The page colours the background can show, per theme (a flat background is the theme's own). */
export const backgroundStops = (background: BackgroundId, theme: ThemeName): string[] =>
  BACKGROUND_PRESETS[background]?.[theme] ?? [THEME_SURFACES[theme].background];

/**
 * Every combination that has to stay readable, across both themes (the setting is shared by
 * every device) and every colour a gradient can show. Empty means the appearance may be saved.
 */
export function contrastProblems(appearance: Appearance): ContrastProblem[] {
  const problems: ContrastProblem[] = [];
  const seen = new Set<string>();
  const add = (problem: ContrastProblem) => {
    const key = `${problem.code}:${problem.theme}:${problem.on}`;
    // Keep only the worst ratio for each kind of problem.
    const index = problems.findIndex((p) => `${p.code}:${p.theme}:${p.on}` === key);
    if (!seen.has(key)) {
      seen.add(key);
      problems.push(problem);
    } else if (problem.ratio < problems[index]!.ratio) problems[index] = problem;
  };
  for (const theme of ['light', 'dark'] as const) {
    const surfaces = THEME_SURFACES[theme];
    const ink = hexToRgb(surfaces.ink);
    const muted = hexToRgb(surfaces.muted);
    const accent = hexToRgb(accentFor(appearance, theme));
    for (const stop of backgroundStops(appearance.background, theme)) {
      const page = hexToRgb(stop);
      const card = blend(hexToRgb(surfaces.card), page, appearance.cardOpacity / 100);
      const checks: [ContrastProblem['code'], ContrastProblem['on'], Rgb, Rgb, number][] = [
        ['accent', 'card', accent, card, MIN_NON_TEXT_CONTRAST],
        ['ink', 'card', ink, card, MIN_TEXT_CONTRAST],
        ['muted', 'card', muted, card, MIN_TEXT_CONTRAST],
        ['ink', 'page', ink, page, MIN_TEXT_CONTRAST],
        ['muted', 'page', muted, page, MIN_TEXT_CONTRAST],
      ];
      for (const [code, on, fg, bg, required] of checks) {
        const ratio = contrastRatio(fg, bg);
        if (ratio < required) add({ code, theme, on, ratio, required });
      }
    }
  }
  return problems;
}

/** `accent` mixed toward `ink` until it reads as text (4.5:1) on `surface`. */
export function accentAsText(accent: Rgb, ink: Rgb, surface: Rgb): string {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = blend(ink, accent, step / 20);
    if (contrastRatio(candidate, surface) >= MIN_TEXT_CONTRAST)
      return rgbToHex(blend(ink, accent, step / 20));
  }
  return rgbToHex(ink);
}

/* ---------- tokens ---------- */

/**
 * CSS custom properties that carry an appearance, applied on the document root. Empty
 * for the default so the shipped look is untouched. `light` and `dark` values are
 * picked by the stylesheet with the theme class; `shared` ones do not depend on it.
 */
export type AppearanceTokens = {
  light: Record<string, string>;
  dark: Record<string, string>;
  shared: Record<string, string>;
};

export function appearanceTokens(appearance: Appearance): AppearanceTokens {
  const tokens: AppearanceTokens = { light: {}, dark: {}, shared: {} };
  for (const theme of ['light', 'dark'] as const) {
    const target = tokens[theme];
    if (appearance.accent !== 'ember') {
      const fill = hexToRgb(accentFor(appearance, theme));
      const surfaces = THEME_SURFACES[theme];
      // Hardest surface for the text: the darkest card under dark ink, the lightest under light ink.
      const cards = backgroundStops(appearance.background, theme)
        .map((stop) => blend(hexToRgb(surfaces.card), hexToRgb(stop), appearance.cardOpacity / 100))
        .sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
      const worstCard = theme === 'light' ? cards[0]! : cards[cards.length - 1]!;
      const foreground = onAccent(fill);
      const text = accentAsText(fill, hexToRgb(surfaces.ink), worstCard);
      const hex = rgbToHex(fill);
      target['--ap-primary'] = hex;
      target['--ap-primary-foreground'] = foreground;
      target['--ap-ring'] = hex;
      target['--ap-accent-text'] = text;
    }
    const stops = BACKGROUND_PRESETS[appearance.background]?.[theme];
    if (stops) target['--ap-page-background'] = `linear-gradient(160deg, ${stops.join(', ')})`;
  }
  if (appearance.cardOpacity < 100)
    tokens.shared['--ap-card-opacity'] = String(appearance.cardOpacity / 100);
  if (appearance.blur) tokens.shared['--ap-card-blur'] = 'blur(12px)';
  return tokens;
}

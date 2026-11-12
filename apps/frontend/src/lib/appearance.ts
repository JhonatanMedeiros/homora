import { appearanceTokens, type Appearance, type ThemeName } from '@homora/shared';

const PREFIX = '--ap-';
const KNOWN = [
  'primary',
  'primary-foreground',
  'ring',
  'accent-text',
  'page-background',
  'card-opacity',
  'card-blur',
  'page-size',
  'page-repeat',
];

/**
 * Writes an appearance onto an element as CSS custom properties. The stylesheet falls back to
 * the shipped Lamplight tokens whenever one is missing, so the default appearance sets nothing.
 * Uses the style object (not a style element) so it also works under a strict style CSP.
 */
export function applyAppearance(
  appearance: Appearance,
  root: HTMLElement = document.documentElement,
) {
  for (const name of KNOWN) {
    root.style.removeProperty(`${PREFIX}${name}-light`);
    root.style.removeProperty(`${PREFIX}${name}-dark`);
    root.style.removeProperty(`${PREFIX}${name}`);
  }
  const tokens = appearanceTokens(appearance);
  for (const theme of ['light', 'dark'] as const)
    for (const [name, value] of Object.entries(tokens[theme]))
      root.style.setProperty(`${name}-${theme}`, value);
  for (const [name, value] of Object.entries(tokens.shared)) root.style.setProperty(name, value);
  if (tokens.light['--ap-page-background']) root.dataset.appearanceBackground = 'true';
  else delete root.dataset.appearanceBackground;
}

/** Styles that make a preview box look like the page would under `appearance`, for one theme. */
export function previewStyle(appearance: Appearance, theme: ThemeName): Record<string, string> {
  const tokens = appearanceTokens(appearance);
  const own = tokens[theme];
  const style: Record<string, string> = {};
  if (own['--ap-primary']) {
    style['--primary'] = own['--ap-primary']!;
    style['--primary-foreground'] = own['--ap-primary-foreground']!;
    style['--ring'] = own['--ap-ring']!;
    style['--accent-text'] = own['--ap-accent-text']!;
  }
  if (own['--ap-page-background']) style.backgroundImage = own['--ap-page-background'];
  if (tokens.shared['--ap-page-size']) {
    style.backgroundSize = tokens.shared['--ap-page-size'];
    style.backgroundRepeat = tokens.shared['--ap-page-repeat']!;
    style.backgroundPosition = 'center';
  }
  const opacity = tokens.shared['--ap-card-opacity'];
  if (opacity)
    style['--card'] = `color-mix(in srgb, var(--card-base) ${Number(opacity) * 100}%, transparent)`;
  if (tokens.shared['--ap-card-blur']) style.backdropFilter = tokens.shared['--ap-card-blur'];
  return style;
}

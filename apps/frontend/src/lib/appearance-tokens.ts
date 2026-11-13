import {
  BACKGROUND_PRESETS,
  accentAsText,
  accentFor,
  backgroundStops,
  blend,
  hexToRgb,
  onAccent,
  relativeLuminance,
  rgbToHex,
  THEME_SURFACES,
  type Appearance,
} from '@homora/shared';

const imageUrl = (name: string) => `/api/appearance/background/${name}`;

/** CSS custom properties consumed by the frontend appearance stylesheet. */
export type AppearanceTokens = {
  light: Record<string, string>;
  dark: Record<string, string>;
  shared: Record<string, string>;
};

/**
 * Converts the shared appearance setting into frontend CSS properties. Empty for the
 * default so the shipped look is untouched. Theme-specific values are selected by CSS.
 */
export function appearanceTokens(appearance: Appearance): AppearanceTokens {
  const tokens: AppearanceTokens = { light: {}, dark: {}, shared: {} };
  for (const theme of ['light', 'dark'] as const) {
    const target = tokens[theme];
    if (appearance.accent !== 'ember') {
      const fill = hexToRgb(accentFor(appearance, theme));
      const surfaces = THEME_SURFACES[theme];
      // Hardest surface for the text: darkest card under dark ink, lightest under light ink.
      const cards = backgroundStops(appearance, theme)
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
    if (appearance.image) {
      const { name, dim } = appearance.image;
      const fade = `linear-gradient(color-mix(in srgb, ${THEME_SURFACES[theme].background} ${dim}%, transparent), color-mix(in srgb, ${THEME_SURFACES[theme].background} ${dim}%, transparent))`;
      target['--ap-page-background'] = `${fade}, url("${imageUrl(name)}")`;
    } else {
      const stops = BACKGROUND_PRESETS[appearance.background]?.[theme];
      if (stops) target['--ap-page-background'] = `linear-gradient(160deg, ${stops.join(', ')})`;
    }
  }
  if (appearance.image) {
    const layout = {
      fill: ['100% 100%, cover', 'no-repeat, no-repeat'],
      fit: ['100% 100%, contain', 'no-repeat, no-repeat'],
      tile: ['100% 100%, auto', 'no-repeat, repeat'],
    }[appearance.image.position];
    tokens.shared['--ap-page-size'] = layout[0]!;
    tokens.shared['--ap-page-repeat'] = layout[1]!;
  }
  if (appearance.cardOpacity < 100)
    tokens.shared['--ap-card-opacity'] = String(appearance.cardOpacity / 100);
  if (appearance.blur) tokens.shared['--ap-card-blur'] = 'blur(12px)';
  return tokens;
}

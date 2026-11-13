export const supportedLocales = ['en', 'pt-BR'] as const;
export type Locale = (typeof supportedLocales)[number];
export const locales: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'pt-BR', label: 'Português (Brasil)' },
];

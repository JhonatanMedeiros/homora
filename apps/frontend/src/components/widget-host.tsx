import type { ReactNode } from 'react';
import { WidgetHostProvider } from '@homora/widgets/ui';
import { tOr, useI18n } from '@/i18n';

export function WidgetHost({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <WidgetHostProvider value={{ locale, t: (key, params) => tOr(key, key, params) }}>
      {children}
    </WidgetHostProvider>
  );
}

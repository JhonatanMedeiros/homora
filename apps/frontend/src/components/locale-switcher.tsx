import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { locales, useI18n } from '@/i18n';

/** Alterna entre os idiomas disponíveis; o rótulo do botão nomeia o idioma de destino. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const { t, locale, setLocale } = useI18n();
  const next = locales.find((item) => item.id !== locale) ?? locales[0];
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      lang={next.id}
      onClick={() => setLocale(next.id)}
      aria-label={`${t('locale.label')}: ${next.label}`}
      title={next.label}
    >
      <Languages />
    </Button>
  );
}

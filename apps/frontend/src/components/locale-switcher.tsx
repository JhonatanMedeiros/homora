import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { locales, useI18n } from '@/i18n';

/** Explicit selector among available languages. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const { t, locale, setLocale } = useI18n();
  const current = locales.find((item) => item.id === locale);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className}
          aria-label={`${t('locale.label')}: ${current?.label ?? locale}`}
          title={`${t('locale.label')}: ${current?.label ?? locale}`}
        >
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('locale.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            const selected = locales.find((item) => item.id === value);
            if (selected) setLocale(selected.id);
          }}
        >
          {locales.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id} lang={item.id}>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

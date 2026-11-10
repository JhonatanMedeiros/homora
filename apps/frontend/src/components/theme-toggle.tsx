import { Contrast } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';

export function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme } = useTheme();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggleTheme}
      aria-label={t('theme.toggle')}
    >
      <Contrast />
    </Button>
  );
}

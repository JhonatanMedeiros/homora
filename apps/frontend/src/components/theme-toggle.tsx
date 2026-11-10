import { Contrast } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';

export function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme } = useTheme();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggleTheme}
      aria-label="Alternar tema"
    >
      <Contrast />
    </Button>
  );
}

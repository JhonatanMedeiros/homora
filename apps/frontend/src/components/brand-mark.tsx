import { House } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

export function BrandMark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <a
      href="/"
      aria-label={t('brand.home')}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-md font-label text-xl font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <House className="size-[18px]" aria-hidden="true" strokeWidth={2.25} />
      </span>
      <span className={compact ? 'max-sm:sr-only' : undefined}>Homora</span>
    </a>
  );
}

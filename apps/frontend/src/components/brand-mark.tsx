import type { MouseEvent } from 'react';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

export function BrandMark({
  className,
  compact,
  iconOnly,
  onNavigate,
}: {
  className?: string;
  compact?: boolean;
  /** Only the mark, with the name kept for screen readers. */
  iconOnly?: boolean;
  onNavigate?: () => void;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!onNavigate) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    onNavigate();
  }

  return (
    <a
      href="/"
      aria-label={t('brand.home')}
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-md pointer-coarse:min-h-11 text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
        <path
          d="M4 13.5 14 5l10 8.5V23a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <rect x="11" y="13" width="6" height="6" rx="1.2" className="fill-primary" />
      </svg>
      <span className={iconOnly ? 'sr-only' : compact ? 'max-sm:sr-only' : undefined}>Homora</span>
    </a>
  );
}

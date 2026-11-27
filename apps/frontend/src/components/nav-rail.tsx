import type { ReactNode } from 'react';
import { Button } from '@homora/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@homora/ui/tooltip';
import { cn } from '@homora/ui/lib/utils';
import { BrandMark } from '@/components/brand-mark';
import { railItems, type NavId } from '@/components/app-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { t } from '@/i18n';

type Props = {
  active: NavId;
  onNavigate: (id: NavId) => void;
  /** Agent proposals waiting for review. */
  pending: number;
  /** The account menu, at the foot of the rail. */
  account: ReactNode;
};

/** The desktop navigation: one column of icons, each named by its tooltip and its label. */
export function NavRail({ active, onNavigate, pending, account }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-homora="nav-rail"
        className="sticky top-0 z-10 hidden h-svh w-16 shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-3 text-sidebar-foreground md:flex"
      >
        <BrandMark
          iconOnly
          onNavigate={() => onNavigate('home')}
          className="size-11 justify-center"
        />
        <nav
          aria-label={t('nav.main')}
          className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-1"
        >
          {railItems.map((item) => {
            const waiting = item.id === 'agents' ? pending : 0;
            const label = t(item.label);
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={
                      waiting === 0
                        ? label
                        : `${label}, ${waiting === 1 ? t('nav.pending.one') : t('nav.pending.other', { count: waiting })}`
                    }
                    aria-current={active === item.id ? 'page' : undefined}
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      'relative size-11 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-5',
                      'aria-[current=page]:bg-primary/15 aria-[current=page]:text-accent-text',
                      item.id === 'settings' && 'mt-auto',
                    )}
                  >
                    <item.icon aria-hidden="true" />
                    {waiting > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[0.625rem] leading-4 text-primary-foreground tabular-nums"
                      >
                        {waiting > 99 ? '99+' : waiting}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={6}>
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        <ThemeToggle className="size-11 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
        {account}
      </div>
    </TooltipProvider>
  );
}

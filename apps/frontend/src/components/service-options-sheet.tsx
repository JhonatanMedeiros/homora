import { SlidersHorizontal, Sparkles } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ArrangeToggle } from '@/components/service-view-toolbar';
import { StatusFilter } from '@/components/status-filter';
import { ViewLayoutFields } from '@/components/view-options';
import type { StatusFilter as StatusFilterValue } from '@/lib/status-filter';
import { t } from '@/i18n';

type Props = {
  toolbar: Omit<ComponentProps<typeof ArrangeToggle>, 'className'> &
    ComponentProps<typeof ViewLayoutFields> & {
      showHostSuggestions: boolean;
      onHostSuggestions: () => void;
    };
  /** Status filter; absent in the Host and Map arrangements, which have no state filter. */
  status?: {
    selected: StatusFilterValue;
    counts: ComponentProps<typeof StatusFilter>['counts'];
    onSelect: (filter: StatusFilterValue) => void;
  };
};

/**
 * Phone version of the Home controls: one button that opens a bottom sheet with the status filter,
 * how services are arranged, the layout and the host suggestions. The desktop keeps them inline.
 */
export function ServiceOptionsSheet({ toolbar, status }: Props) {
  const [open, setOpen] = useState(false);
  const active = status && status.selected !== 'all' ? 1 : 0;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative h-11 shrink-0"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal aria-hidden="true" />
        {t('options.label')}
        {active > 0 && (
          <>
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 size-2.5 rounded-full bg-primary"
            />
            <span className="sr-only">{t('options.active', { count: active })}</span>
          </>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-dvh gap-0 rounded-t-xl">
          <SheetHeader>
            <SheetTitle>{t('options.title')}</SheetTitle>
            <SheetDescription>{t('options.description')}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-2">
            {status && (
              <StatusFilter
                selected={status.selected}
                counts={status.counts}
                onSelect={status.onSelect}
              />
            )}
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs text-muted-foreground">{t('hosts.arrange')}</p>
              <ArrangeToggle
                arrange={toolbar.arrange}
                onArrangeChange={toolbar.onArrangeChange}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <ViewLayoutFields
                view={toolbar.view}
                onViewChange={toolbar.onViewChange}
                showDescriptions={toolbar.showDescriptions}
                onShowDescriptionsChange={toolbar.onShowDescriptionsChange}
                uptimeRange={toolbar.uptimeRange}
                onUptimeRangeChange={toolbar.onUptimeRangeChange}
              />
            </div>
            {toolbar.showHostSuggestions && (
              <Button
                type="button"
                variant="outline"
                className="h-11 justify-start"
                onClick={() => {
                  setOpen(false);
                  toolbar.onHostSuggestions();
                }}
              >
                <Sparkles aria-hidden="true" />
                {t('hosts.suggest.open')}
              </Button>
            )}
          </div>
          <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" className="h-11" onClick={() => setOpen(false)}>
              {t('page.done')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

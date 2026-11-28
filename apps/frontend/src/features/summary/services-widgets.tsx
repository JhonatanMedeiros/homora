import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@homora/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

/** The widgets above the service groups where there is no column for them: shown or folded away. */
export function WidgetsSection({
  open,
  onOpenChange,
  count,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="flex flex-col gap-2">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground max-md:min-h-11 pointer-coarse:min-h-11"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'transition-transform motion-reduce:transition-none',
              !open && '-rotate-90',
            )}
          />
          {t(open ? 'summarygrid.services.widgets.hide' : 'summarygrid.services.widgets.show')}
          <span className="font-mono text-xs tabular-nums">{count}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

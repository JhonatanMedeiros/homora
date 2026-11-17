import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@homora/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@homora/ui/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Keeps it open until the content closes it, for steps that show something only once. */
  locked?: boolean;
  /** A wider dialog, for content laid out in columns. */
  wide?: boolean;
  children: ReactNode;
};

/** A dialog on larger screens and a bottom sheet on phones, with the same content. */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  locked = false,
  wide = false,
  children,
}: Props) {
  const mobile = useIsMobile();
  const guard = locked
    ? {
        onEscapeKeyDown: (event: Event) => event.preventDefault(),
        onInteractOutside: (event: Event) => event.preventDefault(),
      }
    : {};
  if (mobile)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={!locked}
          className="max-h-[90svh] overflow-y-auto rounded-t-xl px-4 pb-6"
          {...guard}
        >
          <SheetHeader className="px-0">
            <SheetTitle>{title}</SheetTitle>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!locked}
        className={cn('max-h-[calc(100svh-2rem)] overflow-y-auto', wide && 'sm:max-w-2xl')}
        {...guard}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { copyAddress } from '@/lib/copy-address';
import { ChevronDown, Copy, ExternalLink, Link2 } from 'lucide-react';
import { linkLabel, linkOpenTarget, type OpenTarget, type Service } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@homora/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@homora/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { LINK_COLOR_CLASS } from '@/lib/service-links';
import { hostOf } from '@/lib/services';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

const targetWord = (target: OpenTarget) =>
  target === 'same-tab' ? t('links.sameTab') : t('links.newTab');

function AddressRow({
  url,
  label,
  target,
  badge,
  onOpen,
}: {
  url: string;
  label: string | null;
  target: OpenTarget;
  badge: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <li className="flex items-center gap-1 rounded-md hover:bg-accent focus-within:bg-accent">
      <a
        href={url}
        target={target === 'same-tab' ? undefined : '_blank'}
        rel="noopener noreferrer"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-3"
      >
        {badge}
        <span className="flex min-w-0 flex-1 flex-col">
          {label && <span className="truncate text-sm">{label}</span>}
          <span className="truncate font-mono text-xs text-muted-foreground">
            {url.replace(/^https?:\/\//, '')}
          </span>
        </span>
        <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="sr-only">{t('links.opensIn', { where: targetWord(target) })}</span>
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 pointer-fine:opacity-0 pointer-fine:focus-visible:opacity-100 pointer-fine:[li:hover_&]:opacity-100 pointer-fine:[li:focus-within_&]:opacity-100"
        aria-label={t('links.copy', { url })}
        onClick={() => void copyAddress(url)}
      >
        <Copy />
      </Button>
    </li>
  );
}

/** The main address first, then the extras in order, each opening the way it is set to open. */
function AddressList({ service, onOpen }: { service: Service; onOpen: () => void }) {
  const fallback = service.openTarget ?? 'new-tab';
  return (
    <ul aria-label={t('links.title', { name: service.name })} className="m-0 list-none p-0">
      <AddressRow
        url={service.url}
        label={null}
        target={fallback}
        onOpen={onOpen}
        badge={
          <span className="w-16 shrink-0 rounded-sm bg-primary/15 px-1.5 py-0.5 text-center text-[0.625rem] font-semibold tracking-wider text-accent-text uppercase">
            {t('links.main')}
          </span>
        }
      />
      <li role="separator" className="mx-2 my-1 border-t" />
      {(service.links ?? []).map((link) => {
        const target = linkOpenTarget(service, link);
        const own = link.name ? link.name : null;
        return (
          <AddressRow
            key={link.id}
            url={link.url}
            label={own ?? (link.type ? null : hostOf(link.url))}
            target={target}
            onOpen={onOpen}
            badge={
              link.type ? (
                <span
                  title={linkLabel(link)}
                  className={cn(
                    'w-16 shrink-0 truncate rounded-sm px-1.5 py-0.5 text-center text-[0.625rem] font-semibold tracking-wider uppercase',
                    LINK_COLOR_CLASS[link.type.color],
                  )}
                >
                  {link.type.name}
                </span>
              ) : (
                <span className="w-16 shrink-0" aria-hidden="true" />
              )
            }
          />
        );
      })}
    </ul>
  );
}

type Props = {
  service: Service;
  /** `button` shows the word and a chevron; `icon` only the icon and the count. */
  variant?: 'button' | 'icon';
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
  className?: string;
};

/**
 * "Links" button of a card: the extra addresses of a service in a popover, or a bottom sheet on a
 * phone. Renders nothing for a service without extra addresses, so such cards look as before. Place
 * it above the card's stretched link (`relative z-10`).
 */
export function ServiceLinksMenu({
  service,
  variant = 'button',
  align = 'end',
  side = 'bottom',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const count = (service.links?.length ?? 0) + 1;
  if (!service.links?.length) return null;
  const label = t('links.buttonLabel', { name: service.name, count });
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('gap-1.5', className)}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-service-links={service.id}
      onClick={mobile ? () => setOpen(true) : undefined}
    >
      <Link2 aria-hidden="true" />
      {variant === 'button' && <span>{t('links.button')}</span>}
      <span className="font-mono text-xs text-muted-foreground">{count}</span>
      {variant === 'button' && (
        <ChevronDown
          aria-hidden="true"
          className={cn('size-3 transition-transform', open && 'rotate-180')}
        />
      )}
    </Button>
  );
  const body = <AddressList service={service} onOpen={() => setOpen(false)} />;

  if (mobile)
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="gap-2 rounded-t-2xl p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <SheetHeader className="p-4 pb-0">
              <SheetTitle>{service.name}</SheetTitle>
              <SheetDescription>
                {t('links.serviceOpens', { where: targetWord(service.openTarget ?? 'new-tab') })}
              </SheetDescription>
            </SheetHeader>
            <div className="max-h-[60dvh] overflow-y-auto px-2 pb-2">{body}</div>
          </SheetContent>
        </Sheet>
      </>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-96 max-w-[90vw] p-1.5">
        <div className="max-h-80 overflow-y-auto">{body}</div>
        <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
          {t('links.serviceOpens', { where: targetWord(service.openTarget ?? 'new-tab') })}
        </p>
      </PopoverContent>
    </Popover>
  );
}

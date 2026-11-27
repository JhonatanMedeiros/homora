import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@homora/ui/sheet';
import type { Service } from '@homora/shared';
import { ServiceDetails, type ServiceDetailsProps } from '@/components/service-details';
import { hostOf } from '@/lib/services';
import { useIsMobile } from '@/hooks/use-mobile';

type Props = Omit<ServiceDetailsProps, 'service' | 'onFullPage'> & {
  service: Service | null;
  onClose: () => void;
};

/**
 * Details without leaving the page: a side panel, or a bottom sheet on phones. Wide screens show
 * the same details in a column instead.
 */
export function ServiceDrawer({ service, onClose, ...details }: Props) {
  const mobile = useIsMobile();
  return (
    <Sheet open={service !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={mobile ? 'bottom' : 'right'}
        className={mobile ? 'max-h-[85dvh] overflow-y-auto rounded-t-xl' : 'sm:max-w-md'}
      >
        {service && (
          <>
            <SheetHeader>
              <SheetTitle>{service.name}</SheetTitle>
              <SheetDescription className="font-mono">{hostOf(service.url)}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
              <ServiceDetails {...details} service={service} onFullPage={onClose} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

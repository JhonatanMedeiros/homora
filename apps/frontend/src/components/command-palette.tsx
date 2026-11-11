import type { Service } from '@homora/shared';
import { House, Moon, Plus, Settings2 } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { StatusLight } from '@/components/status-light';
import { t } from '@/i18n';
import { hostOf, type ServiceStatus } from '@/lib/services';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  managing: boolean;
  onManageChange: (managing: boolean) => void;
  onAddService: () => void;
  onToggleTheme: () => void;
};

/** Ctrl or Cmd K: open any service or run a common action from the keyboard. */
export function CommandPalette({
  open,
  onOpenChange,
  services,
  statuses,
  blockedIds,
  managing,
  onManageChange,
  onAddService,
  onToggleTheme,
}: Props) {
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('palette.title')}
      description={t('palette.placeholder')}
      showCloseButton={false}
    >
      <CommandInput placeholder={t('palette.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('palette.empty')}</CommandEmpty>
        {services.length > 0 && (
          <CommandGroup heading={t('palette.services')}>
            {services.map((service) => (
              <CommandItem
                key={service.id}
                value={`${service.name} ${service.category} ${service.url}`}
                onSelect={() =>
                  run(() => window.open(service.url, '_blank', 'noopener,noreferrer'))
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{service.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {hostOf(service.url)}
                  </span>
                </span>
                <StatusLight
                  state={statuses[service.id]?.status ?? 'unknown'}
                  blocked={
                    blockedIds.has(service.id) && statuses[service.id]?.status !== 'available'
                  }
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading={t('palette.actions')}>
          <CommandItem onSelect={() => run(onAddService)}>
            <Plus />
            {t('page.add')}
          </CommandItem>
          <CommandItem onSelect={() => run(() => onManageChange(!managing))}>
            {managing ? <House /> : <Settings2 />}
            {managing ? t('palette.home') : t('palette.manage')}
          </CommandItem>
          <CommandItem onSelect={() => run(onToggleTheme)}>
            <Moon />
            {t('palette.theme')}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

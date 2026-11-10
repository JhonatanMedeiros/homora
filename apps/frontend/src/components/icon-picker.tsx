import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { iconNames, iconRegistry } from '@/lib/icons';
import { t } from '@/i18n';

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Search data-icon="inline-start" />
          {t('icon.browse')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command label={t('icon.search')}>
          <CommandInput placeholder={t('icon.search')} aria-label={t('icon.search')} />
          <CommandList>
            <CommandEmpty>{t('icon.empty')}</CommandEmpty>
            <CommandGroup heading={t('icon.available')}>
              {iconNames.map((name) => {
                const Icon = iconRegistry[name];
                return (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => {
                      onChange(`lucide:${name}`);
                      setOpen(false);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span className="flex-1">{name}</span>
                    {value === `lucide:${name}` && <Check aria-label={t('icon.selected')} />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

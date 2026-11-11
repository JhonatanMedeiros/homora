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
import { brandIconNames, brandIconUrl, iconNames, iconRegistry } from '@/lib/icons';
import { t } from '@/i18n';

const portugueseKeywords: Record<string, string> = {
  server: 'servidor',
  database: 'banco dados',
  cloud: 'nuvem',
  house: 'casa',
  film: 'filme cinema',
  music: 'musica',
  camera: 'câmera',
  lock: 'cadeado senha',
  shield: 'escudo segurança',
  network: 'rede',
  settings: 'configurações',
  search: 'busca pesquisa',
  folder: 'pasta',
  book: 'livro',
  image: 'imagem foto',
  mail: 'email correio',
  users: 'usuários pessoas',
  calendar: 'calendário',
  clock: 'relógio',
  download: 'baixar',
  upload: 'enviar',
  printer: 'impressora',
  wifi: 'rede sem fio',
  monitor: 'tela',
  globe: 'internet mundo',
  key: 'chave',
};

export function IconPicker({
  value,
  onChange,
  iconOnly = false,
}: {
  value: string;
  onChange: (icon: string) => void;
  /** Compact trigger for tight rows; the label stays available to assistive technology. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? 'icon' : 'default'}
          aria-label={iconOnly ? t('icon.browse') : undefined}
        >
          <Search data-icon={iconOnly ? undefined : 'inline-start'} />
          {!iconOnly && t('icon.browse')}
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
                    keywords={[portugueseKeywords[name] ?? '']}
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
            <CommandGroup heading={t('icon.brands')}>
              {brandIconNames.map((name) => (
                <CommandItem
                  key={`brand-${name}`}
                  value={`brand ${name}`}
                  keywords={[name.replaceAll('-', ' ')]}
                  onSelect={() => {
                    onChange(`brand:${name}`);
                    setOpen(false);
                  }}
                >
                  <img
                    src={brandIconUrl(name)}
                    alt=""
                    loading="lazy"
                    aria-hidden="true"
                    className="size-4 object-contain"
                  />
                  <span className="flex-1">{name}</span>
                  {value === `brand:${name}` && <Check aria-label={t('icon.selected')} />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import type { CoolifyResource, ResourceLink } from '@homora/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CoolifyStateBadge } from '@/components/coolify-state';
import { t } from '@/i18n';
import { RowMenu } from './row-menu';
import type { CardRef } from './connection-model';

type Props = {
  connectionId: number;
  resources: CoolifyResource[];
  selected: Set<string>;
  cards: CardRef[];
  links: ResourceLink[];
  onSelect: (uuid: string, selected: boolean) => void;
  onSelectVisible: (selected: boolean) => void;
  onLink: (resource: CoolifyResource) => void;
  onCreate: (resource: CoolifyResource) => void;
  onUnlink: (resource: CoolifyResource) => void;
};

/** Tabular inventory rows and per-resource actions for the Coolify browser. */
export function CoolifyResourceTable({
  connectionId,
  resources,
  selected,
  cards,
  links,
  onSelect,
  onSelectVisible,
  onLink,
  onCreate,
  onUnlink,
}: Props) {
  const chosenCount = resources.filter((resource) => selected.has(resource.uuid)).length;
  const allChosen = resources.length > 0 && chosenCount === resources.length;

  function linkOf(resource: CoolifyResource) {
    return links.find(
      (item) => item.integrationId === connectionId && item.resourceUuid === resource.uuid,
    );
  }

  function cardName(resource: CoolifyResource) {
    const link = linkOf(resource);
    return link ? (cards.find((card) => card.id === link.serviceId)?.name ?? '…') : '—';
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <Checkbox
              aria-label={t('coolify.selectAll')}
              checked={allChosen ? true : chosenCount > 0 ? 'indeterminate' : false}
              onCheckedChange={(checked) => onSelectVisible(checked === true)}
            />
          </TableHead>
          <TableHead>{t('coolify.colName')}</TableHead>
          <TableHead>{t('coolify.colType')}</TableHead>
          <TableHead>{t('coolify.colState')}</TableHead>
          <TableHead>{t('coolify.colAddresses')}</TableHead>
          <TableHead>{t('coolify.colEnvironment')}</TableHead>
          <TableHead>{t('coolify.colCard')}</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">{t('coolify.colActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.map((resource) => (
          <TableRow key={resource.uuid}>
            <TableCell>
              <Checkbox
                aria-label={t('coolify.selectRow', { name: resource.name })}
                checked={selected.has(resource.uuid)}
                onCheckedChange={(checked) => onSelect(resource.uuid, checked === true)}
              />
            </TableCell>
            <TableCell className="max-w-56 whitespace-normal">
              <div className="font-medium">{resource.name}</div>
              {resource.description && (
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {resource.description}
                </div>
              )}
            </TableCell>
            <TableCell>
              {t(
                resource.type === 'application'
                  ? 'coolify.type.application'
                  : 'coolify.type.service',
              )}
            </TableCell>
            <TableCell>
              <CoolifyStateBadge state={resource.state} />
            </TableCell>
            <TableCell className="max-w-56 whitespace-normal font-mono text-xs">
              {resource.urls.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {resource.urls.map((url) => (
                    <li key={url} className="truncate">
                      {url}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="font-sans text-muted-foreground">{t('coolify.noAddress')}</span>
              )}
            </TableCell>
            <TableCell>
              {resource.environmentId === null
                ? '—'
                : t('coolify.environment', { id: resource.environmentId })}
            </TableCell>
            <TableCell>{cardName(resource)}</TableCell>
            <TableCell>
              <RowMenu label={t('coolify.rowMenu', { name: resource.name })}>
                <DropdownMenuItem onSelect={() => onLink(resource)}>
                  {t('coolify.linkExisting')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCreate(resource)}>
                  {t('coolify.createCard')}
                </DropdownMenuItem>
                {linkOf(resource) && (
                  <DropdownMenuItem variant="destructive" onSelect={() => onUnlink(resource)}>
                    {t('coolify.unlink')}
                  </DropdownMenuItem>
                )}
              </RowMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

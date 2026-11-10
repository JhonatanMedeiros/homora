import { CircleCheck, CircleMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemGroup, ItemTitle, ItemActions } from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import { LabelTape } from '@/components/label-tape';
import { formatDateTime, formatNumber, t } from '@/i18n';

export type Resource = {
  type?: string;
  status?: string;
  name?: string;
  node?: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
};

const gb = (bytes: number) => formatNumber(bytes / 1024 ** 3, { maximumFractionDigits: 1 });
const pct = (fraction: number) => Math.min(100, Math.max(0, Math.round(fraction * 100)));

function Usage({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <b className="font-label font-semibold tracking-wide uppercase">{label}</b>
        <span className="font-mono text-muted-foreground tabular-nums">{text}</span>
      </div>
      <Progress value={value} aria-label={label} />
    </div>
  );
}

type Props = {
  resources: Resource[];
  checkedAt: string | null;
  showAll: boolean;
  onToggleAll: () => void;
};

/** Nós com uso de CPU e memória, resumo do inventário e lista de VMs e containers. */
export function ProxmoxResources({ resources, checkedAt, showAll, onToggleAll }: Props) {
  const nodes = resources.filter((r) => r.type === 'node');
  const guests = resources.filter((r) => r.type === 'qemu' || r.type === 'lxc');
  const shownGuests = showAll ? guests : guests.slice(0, 8);
  return (
    <div className="flex flex-col gap-4">
      {nodes.map((node, index) => {
        // A API do Proxmox identifica o nó em `node`; `name` fica como alternativa.
        const label = node.node ?? node.name ?? t('proxmox.unnamed');
        return (
          <div key={`${label}:${index}`} className="flex flex-col gap-3 rounded-md border p-3">
            <h3 className="text-lg">{label}</h3>
            {typeof node.cpu === 'number' && (
              <Usage label="CPU" value={pct(node.cpu)} text={`${pct(node.cpu)}%`} />
            )}
            {typeof node.mem === 'number' && typeof node.maxmem === 'number' && node.maxmem > 0 && (
              <Usage
                label={t('proxmox.memory')}
                value={pct(node.mem / node.maxmem)}
                text={t('proxmox.memoryOf', { used: gb(node.mem), total: gb(node.maxmem) })}
              />
            )}
          </div>
        );
      })}
      <p className="text-sm text-muted-foreground">
        {t('proxmox.summary', {
          nodes: t('proxmox.nodes', { count: nodes.length }),
          vms: resources.filter((r) => r.type === 'qemu').length,
          cts: resources.filter((r) => r.type === 'lxc').length,
        })}
      </p>
      {checkedAt && (
        <p className="text-sm text-muted-foreground">
          {t('proxmox.lastUpdate')}
          <time dateTime={checkedAt}>{formatDateTime(checkedAt)}</time>
        </p>
      )}
      {guests.length > 0 && (
        <ItemGroup>
          {shownGuests.map((g, index) => {
            const running = g.status === 'running';
            const StateIcon = running ? CircleCheck : CircleMinus;
            return (
              <Item key={`${g.node}:${g.type}:${g.name ?? index}`} size="sm" className="px-0">
                <ItemContent className="flex-row items-center gap-2">
                  <ItemTitle>{g.name ?? t('proxmox.unnamed')}</ItemTitle>
                  <LabelTape>{g.type === 'qemu' ? 'VM' : 'CT'}</LabelTape>
                </ItemContent>
                <ItemActions className={running ? 'text-success' : 'text-muted-foreground'}>
                  <StateIcon className="size-4" aria-hidden="true" />
                  <span className="text-sm font-medium">
                    {running ? t('proxmox.running') : (g.status ?? t('proxmox.unknownStatus'))}
                  </span>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
      {guests.length > 8 && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onToggleAll}>
            {showAll ? t('proxmox.showLess') : t('proxmox.showAll', { count: guests.length })}
          </Button>
        </div>
      )}
    </div>
  );
}

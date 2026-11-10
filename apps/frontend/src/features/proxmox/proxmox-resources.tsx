import { CircleCheck, CircleMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemGroup, ItemTitle, ItemActions } from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import { LabelTape } from '@/components/label-tape';

export type Resource = {
  type?: string;
  status?: string;
  name?: string;
  node?: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
};

const gb = (bytes: number) =>
  (bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
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
      {nodes.map((node) => (
        <div key={node.name} className="flex flex-col gap-3 rounded-md border p-3">
          <h3 className="text-lg">{node.name}</h3>
          {typeof node.cpu === 'number' && (
            <Usage label="CPU" value={pct(node.cpu)} text={`${pct(node.cpu)}%`} />
          )}
          {typeof node.mem === 'number' && typeof node.maxmem === 'number' && node.maxmem > 0 && (
            <Usage
              label="Memória"
              value={pct(node.mem / node.maxmem)}
              text={`${gb(node.mem)} de ${gb(node.maxmem)} GB`}
            />
          )}
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        {nodes.length} {nodes.length === 1 ? 'nó' : 'nós'} ·{' '}
        {resources.filter((r) => r.type === 'qemu').length} VMs ·{' '}
        {resources.filter((r) => r.type === 'lxc').length} containers
      </p>
      {checkedAt && (
        <p className="text-sm text-muted-foreground">
          Última atualização:{' '}
          <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString('pt-BR')}</time>
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
                  <ItemTitle>{g.name ?? 'sem nome'}</ItemTitle>
                  <LabelTape>{g.type === 'qemu' ? 'VM' : 'CT'}</LabelTape>
                </ItemContent>
                <ItemActions className={running ? 'text-success' : 'text-muted-foreground'}>
                  <StateIcon className="size-4" aria-hidden="true" />
                  <span className="text-sm font-medium">
                    {running ? 'ativo' : (g.status ?? 'desconhecido')}
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
            {showAll ? 'Mostrar menos' : `Mostrar todos (${guests.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}

import type { Service } from '@homora/shared';
import type { ServiceStatus } from '@/lib/services';

type Props = {
  query: string;
  services: Service[];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  onClose: () => void;
};
export function QuickResults({ query, services, statuses, blockedIds, onClose }: Props) {
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  if (!needle) return null;
  const results = services
    .filter((s) =>
      `${s.name} ${s.category} ${s.description} ${s.url}`
        .toLocaleLowerCase('pt-BR')
        .includes(needle),
    )
    .slice(0, 8);
  if (!results.length) return null;
  return (
    <div className="absolute top-full z-10 mt-2 w-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Acesso rápido · use as setas para navegar
      </p>
      <ul aria-label="Resultados rápidos">
        {results.map((service) => {
          const state = blockedIds.has(service.id)
            ? 'Sem monitoramento'
            : statuses[service.id]?.status === 'available'
              ? 'Disponível'
              : statuses[service.id]?.status === 'unavailable'
                ? 'Indisponível'
                : 'Sem informação';
          return (
            <li key={service.id}>
              <a
                data-quick-result
                href={service.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onKeyDown={(event) => {
                  const links = Array.from(
                    document.querySelectorAll<HTMLAnchorElement>('[data-quick-result]'),
                  );
                  const index = links.indexOf(event.currentTarget);
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    links[
                      (index + (event.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length
                    ]?.focus();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    onClose();
                  }
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{service.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {service.category}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{state}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

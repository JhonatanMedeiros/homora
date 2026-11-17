import { Button } from '@homora/ui/button';
import { PROBE_DOT } from '@/lib/probe-dot';
import { t } from '@/i18n';
import type { LightState } from '@/lib/services';

export type HomeProbe = {
  id: number;
  name: string;
  state: LightState;
  /** The state in words, so the light never carries the meaning alone. */
  label: string;
  /** Latency or a short fallback. */
  meta: string | null;
};

/**
 * The probes (monitors without a card) at any width. The side rail shows them only on wide
 * screens, so the Home keeps its own compact list: light, name, state in words and latency.
 */
export function HomeProbes({ probes, onOpen }: { probes: HomeProbe[]; onOpen: () => void }) {
  if (!probes.length) return null;
  return (
    <section aria-label={t('rail.probes')} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('rail.probes')}</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onOpen}>
          {t('home.probes.manage')}
        </Button>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {probes.map((probe) => (
          <li key={probe.id}>
            <button
              type="button"
              onClick={onOpen}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-accent/50"
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${PROBE_DOT[probe.state]}`}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{probe.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {probe.label}
                {probe.meta && <span className="font-mono tabular-nums"> · {probe.meta}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

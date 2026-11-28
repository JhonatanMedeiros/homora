import { Card, CardContent, CardHeader, CardTitle } from '@homora/ui/card';
import { cn } from '@homora/ui/lib/utils';
import type { WindowState } from '@/features/uptime/status-summary';
import { STATE_COLOR, STATE_LABEL, STATE_ORDER } from '@/features/home/states';
import { t } from '@/i18n';

export type Window = { id: number; name: string; state: WindowState };

/** Past this, the grid stops growing and says how many more there are. */
const MAX_WINDOWS = 80;

/** All services at a glance: one small window each, lit by its state. */
export function ServiceWindows({
  windows,
  selectedId,
  onSelect,
  className,
}: {
  windows: Window[];
  selectedId?: number;
  onSelect: (id: number) => void;
  className?: string;
}) {
  if (windows.length === 0) return null;
  // Problems first, so the windows that matter are found without reading them all.
  const ordered = [...windows].sort(
    (a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state),
  );
  return (
    <Card className={cn('gap-2', className)}>
      <CardHeader>
        <CardTitle className="text-sm">
          <h2 className="text-sm">{t('panel.windows')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="m-0 flex list-none flex-wrap gap-0.5 p-0">
          {ordered.slice(0, MAX_WINDOWS).map((item) => {
            const label = t('panel.window', {
              name: item.name,
              state: t(STATE_LABEL[item.state]),
            });
            const on = selectedId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-label={label}
                  aria-pressed={on}
                  title={label}
                  className="grid size-7 place-items-center rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:ring-1 aria-pressed:ring-primary pointer-coarse:size-11"
                >
                  {/* Shape and colour together: the state never rests on colour alone. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block size-3.5',
                      item.state === 'down'
                        ? 'rounded-full'
                        : item.state === 'unknown'
                          ? 'rounded-sm border-2 border-muted-foreground'
                          : 'rounded-sm',
                      item.state !== 'unknown' && STATE_COLOR[item.state],
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        {ordered.length > MAX_WINDOWS && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('banner.more', { count: ordered.length - MAX_WINDOWS })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

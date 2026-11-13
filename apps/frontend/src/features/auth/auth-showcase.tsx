import { useEffect, useState } from 'react';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import type { LightState } from '@/lib/services';
import { t } from '@/i18n';

type Row = { icon: string; name: string; host: string };

// Static, invented examples: nothing here comes from the user's configuration, so the
// sign-in page exposes no service names or hosts before authentication.
const rows: Row[] = [
  { icon: 'brand:proxmox', name: 'Proxmox', host: 'pve.lan:8006' },
  { icon: 'brand:jellyfin', name: 'Jellyfin', host: 'media.lan:8096' },
  { icon: 'brand:home-assistant', name: 'Home Assistant', host: 'ha.lan:8123' },
  { icon: 'brand:nextcloud', name: 'Nextcloud', host: 'cloud.lan' },
  { icon: 'brand:pi-hole', name: 'Pi-hole', host: 'dns.lan/admin' },
  { icon: 'brand:gitea', name: 'Gitea', host: 'git.lan:3000' },
];

const initial: LightState[] = [
  'available',
  'available',
  'available',
  'unknown',
  'available',
  'available',
];

// Each step changes one row so the lights feel alive without turning into a slideshow.
const steps: [number, LightState][] = [
  [3, 'available'],
  [4, 'degraded'],
  [1, 'unavailable'],
  [4, 'available'],
  [1, 'available'],
  [3, 'unknown'],
];

function useDemoStates() {
  const [states, setStates] = useState<LightState[]>(initial);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let step = 0;
    const timer = window.setInterval(() => {
      const [index, state] = steps[step % steps.length];
      step += 1;
      setStates((current) => current.map((value, i) => (i === index ? state : value)));
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);
  return states;
}

/** Decorative panel beside the sign-in form: a small, animated preview of the service list. */
export function AuthShowcase() {
  const states = useDemoStates();
  return (
    <aside
      data-slot="auth-showcase"
      className="relative hidden items-center justify-center overflow-hidden border-r bg-card/40 p-10 lg:flex xl:p-14"
    >
      <div aria-hidden="true" className="auth-glow pointer-events-none absolute" />
      <div className="relative flex w-full max-w-md flex-col gap-10 xl:max-w-lg 2xl:max-w-xl">
        <div className="flex flex-col gap-3">
          <p className="text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-5xl 2xl:text-6xl">
            {t('auth.showcaseTitle')}
          </p>
          <p className="text-muted-foreground 2xl:text-lg">{t('auth.showcaseHint')}</p>
        </div>
        <ul className="flex flex-col gap-2" aria-hidden="true">
          {rows.map((row, index) => (
            <li
              key={row.name}
              style={{ '--auth-row': index } as React.CSSProperties}
              className="auth-row flex items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5 data-[faded=true]:opacity-50 data-[faded=2]:opacity-25"
              data-faded={index === 4 ? 'true' : index === 5 ? '2' : undefined}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <ServiceIcon icon={row.icon} name={row.name} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate leading-tight font-medium">{row.name}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {row.host}
                </span>
              </span>
              <StatusLight state={states[index]} className="text-xs" />
            </li>
          ))}
        </ul>
        <p className="font-mono text-xs text-muted-foreground">{t('auth.showcaseExample')}</p>
      </div>
    </aside>
  );
}

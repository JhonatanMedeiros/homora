import { useEffect, useState } from 'react';
import { browserTimeZone, clockPresentation, type ClockConfig } from '../../../clock.js';
import { useWidgetHost } from '../../../ui/host.js';

function useNow(seconds: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Ticks on the next boundary (second or minute), not on a drifting interval.
    const step = seconds ? 1_000 : 60_000;
    const timer = window.setTimeout(() => setNow(new Date()), step - (Date.now() % step));
    return () => window.clearTimeout(timer);
  }, [now, seconds]);
  return now;
}

/** Time and date in the chosen format and time zone. */
export function Clock({ preferences }: { preferences: ClockConfig }) {
  const { locale } = useWidgetHost();
  const now = useNow(preferences.seconds);
  const { time, date, zone } = clockPresentation.present({ locale, config: preferences, now });
  const custom = preferences.timeZone && preferences.timeZone !== browserTimeZone();
  return (
    <div className="flex items-baseline gap-2 sm:gap-3">
      <time
        dateTime={now.toISOString()}
        className="font-mono text-base font-medium tabular-nums sm:text-xl"
      >
        {time}
      </time>
      {(preferences.date || custom) && (
        <span className="text-xs text-muted-foreground sm:text-sm">
          {[preferences.date && date, custom && zone].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  );
}

export { Editor } from './editor.js';

export function Preview({ config, name }: { config: ClockConfig; name: string }) {
  const { t } = useWidgetHost();
  return (
    <aside
      aria-label={t('pageWidgets.preview')}
      className="flex flex-col gap-2 rounded-md bg-muted/50 p-3"
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('pageWidgets.preview')}
      </span>
      <div className="flex flex-col gap-3 rounded-md border bg-card p-3">
        <span className="truncate text-sm font-medium">{name || t('pageWidgets.clock')}</span>
        <Clock preferences={config} />
      </div>
      <span className="text-xs text-muted-foreground">{t('pageWidgets.previewHint')}</span>
    </aside>
  );
}

import { clockWidget, defaultClockConfig } from '../../../clock.js';
import { Editor } from './editor.js';
import type { WidgetUI } from '../../../ui/types.js';
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.clock',
  description: 'pageWidgets.clockDesc',
  defaultConfig: defaultClockConfig,
  parse: clockWidget.parseConfig,
  View: ({ config }) => <Clock preferences={config as ClockConfig} />,
  Editor: ({ config, onChange }) => <Editor config={config as ClockConfig} onChange={onChange} />,
  Gallery: () => <Clock preferences={defaultClockConfig} />,
  Preview: ({ config, name }) => <Preview config={config as ClockConfig} name={name} />,
};

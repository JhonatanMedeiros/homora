import {
  Activity,
  Bot,
  ChartColumn,
  Gauge,
  Grid3x3,
  Server,
  Star,
  Timer,
  TriangleAlert,
  Wrench,
  Radar,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Checkbox } from '@homora/ui/checkbox';
import {
  summaryOptions,
  summaryWidgets,
  summaryWidgetTypes,
  type SummaryConfig,
  type SummaryOption,
  type SummaryWidgetType,
} from '../summary.js';
import { useWidgetHost } from './host.js';
import type { WidgetUI } from './types.js';

const icons: Record<SummaryWidgetType, LucideIcon> = {
  'summary-pinned': Star,
  'summary-attention': TriangleAlert,
  'summary-services': Grid3x3,
  'summary-hosts': Server,
  'summary-probes': Radar,
  'summary-figures': ChartColumn,
  'summary-proposals': Bot,
  'summary-status': Activity,
  'summary-availability': Gauge,
  'summary-latency': Timer,
  'summary-maintenance': Wrench,
};

type Choices = Partial<Record<SummaryOption, string[]>>;

/** The names that can be chosen, read once for the options a widget has. */
function useChoices(options: readonly SummaryOption[]) {
  const { monitoring } = useWidgetHost();
  const readScopes = monitoring?.readScopes;
  const readProbes = monitoring?.readProbes;
  const [state, setState] = useState<{ choices: Choices; failed: boolean; loading: boolean }>({
    choices: {},
    failed: false,
    loading: true,
  });
  const probes = options.includes('probes');
  useEffect(() => {
    const controller = new AbortController();
    const read = async (): Promise<Choices> => {
      if (probes) {
        if (!readProbes) throw new Error('No probes');
        return { probes: (await readProbes(controller.signal)).map((probe) => probe.name) };
      }
      if (!readScopes) throw new Error('No scopes');
      const scopes = await readScopes(controller.signal);
      return {
        groups: scopes.groups.map((group) => group.name),
        pages: scopes.pages.map((page) => page.name),
      };
    };
    void read().then(
      (choices) => {
        if (!controller.signal.aborted) setState({ choices, failed: false, loading: false });
      },
      () => {
        if (!controller.signal.aborted) setState({ choices: {}, failed: true, loading: false });
      },
    );
    return () => controller.abort();
  }, [probes, readScopes, readProbes]);
  return state;
}

function Editor({
  options,
  config,
  onChange,
}: {
  options: readonly SummaryOption[];
  config: SummaryConfig;
  onChange: (config: SummaryConfig) => void;
}) {
  const { t } = useWidgetHost();
  const { choices, failed, loading } = useChoices(options);
  return (
    <div className="space-y-4">
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('summaryOptions.error')}
        </p>
      )}
      {loading && <p role="status">{t('common.loading')}</p>}
      {options.map((option) => {
        const chosen = config[option] ?? [];
        const offered = choices[option] ?? [];
        // A chosen name that no longer exists stays listed, so it can be seen and unchecked.
        const names = [...new Set([...offered, ...chosen])];
        return (
          <fieldset key={option} className="space-y-1">
            <legend className="font-medium">{t(`summaryOptions.${option}`)}</legend>
            <p className="text-xs text-muted-foreground">{t('summaryOptions.all')}</p>
            {names.map((name) => (
              <label key={name} className="flex min-h-11 items-center gap-2 break-all">
                <Checkbox
                  checked={chosen.includes(name)}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...config,
                      [option]:
                        checked === true
                          ? [...chosen, name]
                          : chosen.filter((item) => item !== name),
                    })
                  }
                />
                {name}
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

/** The dialog says what the widget will cover; the Summary itself draws the widget. */
function Preview({ config }: { config: SummaryConfig }) {
  const { t } = useWidgetHost();
  const names = Object.values(config).flatMap((value) => value ?? []);
  return (
    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      {names.length > 0
        ? t('summaryOptions.showing', { names: names.join(', ') })
        : t('summaryOptions.everything')}
    </p>
  );
}

function summaryWidgetUI(type: SummaryWidgetType): WidgetUI {
  const options = summaryOptions[type];
  const key = `summaryWidgets.${type.slice('summary-'.length)}`;
  const Icon = icons[type];
  return {
    name: key,
    description: `${key}Desc`,
    category: 'overview',
    keywords: ['summary', 'overview', 'resumo'],
    defaultConfig: {},
    parse: summaryWidgets[type].parseConfig,
    // The application draws these on the Summary, from the health it has already read.
    View: () => null,
    Editor: ({ config, onChange }) => (
      <Editor options={options} config={config as SummaryConfig} onChange={onChange} />
    ),
    Preview: ({ config }) => <Preview config={config as SummaryConfig} />,
    Gallery: () => <Icon aria-hidden="true" />,
  };
}

export const summaryWidgetUIs = Object.fromEntries(
  summaryWidgetTypes.map((type) => [type, summaryWidgetUI(type)]),
) as Record<SummaryWidgetType, WidgetUI>;

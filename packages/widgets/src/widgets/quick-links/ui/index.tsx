import { ArrowDown, ArrowUp, Link, Trash2 } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Field, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  defaultQuickLinksConfig,
  isSafeLinkUrl,
  MAX_LINKS,
  widgetQuickLinksWidget,
  type QuickLinksConfig,
} from '../definition.js';

export function View({ config }: { config: QuickLinksConfig }) {
  const { t, wide } = useWidgetHost();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {config.title && <p className="break-words font-medium">{config.title}</p>}
      {config.links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pageWidgets.quickLinksEmpty')}</p>
      ) : (
        <ul
          className={
            wide
              ? 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2'
              : 'grid min-w-0 grid-cols-1 gap-2'
          }
        >
          {config.links
            .filter((link) => isSafeLinkUrl(link.url))
            .map((link, index) => (
              <li key={index} className="min-w-0">
                <a
                  className="block break-words text-sm text-accent-text underline"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
export function Editor({
  config,
  onChange,
}: {
  config: QuickLinksConfig;
  onChange: (config: QuickLinksConfig) => void;
}) {
  const { t } = useWidgetHost();
  const update = (links: QuickLinksConfig['links']) => onChange({ ...config, links });
  const move = (index: number, offset: number) => {
    const links = [...config.links];
    const target = index + offset;
    [links[index], links[target]] = [links[target]!, links[index]!];
    update(links);
  };
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="quick-links-title">{t('pageWidgets.quickLinksTitle')}</FieldLabel>
        <Input
          id="quick-links-title"
          maxLength={100}
          value={config.title}
          onChange={(e) => onChange({ ...config, title: e.target.value })}
        />
      </Field>
      <p className="text-sm text-muted-foreground">{t('pageWidgets.quickLinksLimit')}</p>
      {config.links.map((link, index) => (
        <div key={index} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
          <Field>
            <FieldLabel htmlFor={`quick-link-label-${index}`}>
              {t('pageWidgets.quickLinksLabel')} {index + 1}
            </FieldLabel>
            <Input
              id={`quick-link-label-${index}`}
              maxLength={100}
              value={link.label}
              onChange={(e) =>
                update(
                  config.links.map((item, i) =>
                    i === index ? { ...item, label: e.target.value } : item,
                  ),
                )
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`quick-link-url-${index}`}>
              {t('pageWidgets.quickLinksUrl')} {index + 1}
            </FieldLabel>
            <Input
              id={`quick-link-url-${index}`}
              type="url"
              maxLength={2048}
              value={link.url}
              onChange={(e) =>
                update(
                  config.links.map((item, i) =>
                    i === index ? { ...item, url: e.target.value } : item,
                  ),
                )
              }
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('pageWidgets.quickLinksUp', { number: index + 1 })}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('pageWidgets.quickLinksDown', { number: index + 1 })}
              disabled={index === config.links.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('pageWidgets.quickLinksRemove', { number: index + 1 })}
              onClick={() => update(config.links.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
      {config.links.length > 0 && !widgetQuickLinksWidget.parseConfig(config) && (
        <p className="text-sm text-destructive">{t('pageWidgets.quickLinksInvalid')}</p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={config.links.length >= MAX_LINKS}
        onClick={() => update([...config.links, { label: '', url: '' }])}
      >
        {t('pageWidgets.quickLinksAdd')}
      </Button>
    </div>
  );
}
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetQuickLinks',
  description: 'pageWidgets.widgetQuickLinksDesc',
  category: 'utilities',
  keywords: ['links', 'bookmarks', 'favorites', 'favoritos'],
  defaultConfig: defaultQuickLinksConfig,
  parse: widgetQuickLinksWidget.parseConfig,
  canSubmit: (config) => widgetQuickLinksWidget.parseConfig(config) !== null,
  View: ({ config }) => <View config={config as QuickLinksConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as QuickLinksConfig} onChange={onChange} />
  ),
  Gallery: () => <Link aria-hidden="true" />,
};

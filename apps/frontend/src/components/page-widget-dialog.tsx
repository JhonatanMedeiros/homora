import { enUS, ptBR } from 'date-fns/locale';
import { Calendar } from '@homora/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@homora/ui/popover';
import { defaultCountdownConfig, type CountdownConfig } from '@homora/widgets/countdown';
import { useState } from 'react';
import { ArrowLeft, CalendarDays, NotebookPen } from 'lucide-react';
import { defaultClockConfig, type ClockConfig } from '@homora/widgets/clock';
import { MAX_NOTE_LENGTH, type NoteConfig } from '@homora/widgets/note';
import { Textarea } from '@homora/ui/textarea';
import { Button } from '@homora/ui/button';
import { Input } from '@homora/ui/input';
import { Switch } from '@homora/ui/switch';
import { Field, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Clock } from '@/components/top-bar';
import type { Connection } from '@/features/connections/connection-model';
import type { PageRow } from '@/hooks/use-pages';
import { listTimeZones } from '@/lib/clock';
import { t, useI18n } from '@/i18n';

export type WidgetDraft = {
  id: number | null;
  pageId: number;
  type: string;
  name: string;
  config: ClockConfig | CountdownConfig | NoteConfig;
  connectionId: number | null;
};

type Props = {
  /** `null` closes the dialog. A new widget without a `chosen` kind starts on the gallery. */
  draft: WidgetDraft | null;
  chosen: boolean;
  connections: Connection[];
  pages: PageRow[];
  busy: boolean;
  error: string;
  onChange: (draft: WidgetDraft) => void;
  onChoose: (chosen: boolean) => void;
  onSubmit: () => void;
  onClose: () => void;
};

/** Add flow: a searchable gallery first, then the options with a live preview. Editing skips the gallery. */
export function PageWidgetDialog({
  draft,
  chosen,
  connections,
  pages,
  busy,
  error,
  onChange,
  onChoose,
  onSubmit,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { locale } = useI18n();
  const gallery = draft !== null && draft.id === null && !chosen;
  const pageName = pages.find((page) => page.id === draft?.pageId)?.name ?? '';
  const clockName = t('pageWidgets.clock');
  const needle = query.trim().toLowerCase();
  const showCountdown = !needle || t('pageWidgets.countdown').toLowerCase().includes(needle);
  const showClock = !needle || clockName.toLowerCase().includes(needle);
  const showNote = !needle || t('pageWidgets.note').toLowerCase().includes(needle);
  const shown = connections.filter(
    (connection) =>
      !needle ||
      connection.name.toLowerCase().includes(needle) ||
      connection.type.toLowerCase().includes(needle),
  );
  const setConfig = (patch: Partial<ClockConfig & CountdownConfig>) =>
    draft && onChange({ ...draft, config: { ...draft.config, ...patch } });
  const kindName =
    draft?.connectionId == null
      ? draft?.type === 'countdown'
        ? t('pageWidgets.countdown')
        : draft?.type === 'note'
          ? t('pageWidgets.note')
          : clockName
      : (connections.find((connection) => connection.id === draft.connectionId)?.name ??
        draft.type);
  const pick = (connection: Connection | null, localType = 'clock') => {
    if (!draft) return;
    onChange({
      ...draft,
      type: connection?.type ?? localType,
      config:
        !connection && localType === 'countdown'
          ? defaultCountdownConfig
          : !connection && localType === 'note'
            ? { text: '' }
            : defaultClockConfig,
      connectionId: connection?.id ?? null,
    });
    onChoose(true);
  };
  return (
    <ResponsiveDialog
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) {
          setQuery('');
          onClose();
        }
      }}
      wide
      title={gallery ? t('pageWidgets.add') : draft?.id ? t('pageWidgets.edit') : kindName}
      description={
        gallery
          ? t('pageWidgets.pick', { page: pageName })
          : draft?.id
            ? kindName
            : t('pageWidgets.willAdd', { page: pageName })
      }
    >
      {draft && gallery && (
        <div className="flex flex-col gap-4">
          <Input
            type="search"
            aria-label={t('pageWidgets.search')}
            placeholder={t('pageWidgets.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {(showClock || showCountdown || showNote) && (
            <section aria-labelledby="pw-group-homora" className="flex flex-col gap-2">
              <h3
                id="pw-group-homora"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {t('pageWidgets.groupHomora')}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {showClock && (
                  <GalleryOption
                    title={clockName}
                    description={t('pageWidgets.clockDesc')}
                    onPick={() => pick(null)}
                  >
                    <Clock preferences={defaultClockConfig} />
                  </GalleryOption>
                )}
                {showCountdown && (
                  <GalleryOption
                    title={t('pageWidgets.countdown')}
                    description={t('pageWidgets.countdownDesc')}
                    onPick={() => pick(null, 'countdown')}
                  >
                    ⌛
                  </GalleryOption>
                )}
                {showNote && (
                  <GalleryOption
                    title={t('pageWidgets.note')}
                    description={t('pageWidgets.noteDesc')}
                    onPick={() => pick(null, 'note')}
                  >
                    <NotebookPen aria-hidden="true" />
                  </GalleryOption>
                )}
              </div>
            </section>
          )}
          {shown.length > 0 && (
            <section aria-labelledby="pw-group-connections" className="flex flex-col gap-2">
              <h3
                id="pw-group-connections"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {t('pageWidgets.groupConnections')}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {shown.map((connection) => (
                  <GalleryOption
                    key={connection.id}
                    title={connection.name}
                    description={t('pageWidgets.connectionDesc')}
                    onPick={() => pick(connection)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {connection.type}
                    </span>
                  </GalleryOption>
                ))}
              </div>
            </section>
          )}
          {!showClock && !showCountdown && !showNote && shown.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('pageWidgets.noMatch')}</p>
          )}
        </div>
      )}
      {draft && !gallery && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div
            className={
              draft.type === 'clock' ? 'grid gap-4 md:grid-cols-[1fr_16rem]' : 'flex flex-col gap-4'
            }
          >
            <FieldGroup>
              {draft.type === 'clock' && (
                <>
                  <Field>
                    <FieldLabel htmlFor="pw-zone">{t('settings.ui.timeZone')}</FieldLabel>
                    <FormSelect
                      id="pw-zone"
                      value={(draft.config as ClockConfig).timeZone}
                      onChange={(event) => setConfig({ timeZone: event.target.value })}
                    >
                      <FormSelectOption value="">
                        {t('settings.ui.timeZoneBrowser', {
                          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        })}
                      </FormSelectOption>
                      {listTimeZones().map((zone) => (
                        <FormSelectOption key={zone} value={zone}>
                          {zone}
                        </FormSelectOption>
                      ))}
                    </FormSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pw-hours">{t('settings.ui.hours')}</FieldLabel>
                    <FormSelect
                      id="pw-hours"
                      value={(draft.config as ClockConfig).hourFormat}
                      onChange={(event) =>
                        setConfig({ hourFormat: event.target.value as ClockConfig['hourFormat'] })
                      }
                    >
                      <FormSelectOption value="auto">{t('settings.ui.hoursAuto')}</FormSelectOption>
                      <FormSelectOption value="12h">{t('settings.ui.hours12')}</FormSelectOption>
                      <FormSelectOption value="24h">{t('settings.ui.hours24')}</FormSelectOption>
                    </FormSelect>
                  </Field>
                  <Field orientation="horizontal">
                    <Switch
                      id="pw-date"
                      checked={(draft.config as ClockConfig).date}
                      onCheckedChange={(date) => setConfig({ date })}
                    />
                    <FieldLabel htmlFor="pw-date">{t('settings.ui.date')}</FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <Switch
                      id="pw-seconds"
                      checked={(draft.config as ClockConfig).seconds}
                      onCheckedChange={(seconds) => setConfig({ seconds })}
                    />
                    <FieldLabel htmlFor="pw-seconds">{t('settings.ui.seconds')}</FieldLabel>
                  </Field>
                </>
              )}
              {draft.type === 'countdown' &&
                (() => {
                  const config = draft.config as CountdownConfig;
                  return (
                    <>
                      <Field>
                        <FieldLabel htmlFor="pw-event">{t('pageWidgets.eventName')}</FieldLabel>
                        <Input
                          id="pw-event"
                          required
                          maxLength={60}
                          value={config.eventName}
                          onChange={(event) => setConfig({ eventName: event.target.value })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="pw-target">{t('pageWidgets.eventDate')}</FieldLabel>
                        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              id="pw-target"
                              type="button"
                              variant="outline"
                              className="justify-start"
                            >
                              <CalendarDays data-icon="inline-start" />
                              {config.localDateTime
                                ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                                    new Date(`${config.localDateTime.slice(0, 10)}T12:00:00`),
                                  ) + `, ${config.localDateTime.slice(11)}`
                                : t('pageWidgets.chooseDate')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-auto p-0">
                            <Calendar
                              mode="single"
                              locale={locale === 'pt-BR' ? ptBR : enUS}
                              selected={
                                config.localDateTime
                                  ? new Date(`${config.localDateTime.slice(0, 10)}T12:00:00`)
                                  : undefined
                              }
                              defaultMonth={
                                config.localDateTime
                                  ? new Date(`${config.localDateTime.slice(0, 10)}T12:00:00`)
                                  : undefined
                              }
                              onSelect={(date) => {
                                if (!date) return;
                                const day = `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                setConfig({
                                  localDateTime: `${day}T${config.localDateTime.slice(11) || '00:00'}`,
                                });
                              }}
                            />
                            <FieldGroup className="gap-3 border-t p-3">
                              <Field>
                                <FieldLabel htmlFor="pw-hour">
                                  {t('pageWidgets.eventHour')}
                                </FieldLabel>
                                <FormSelect
                                  id="pw-hour"
                                  disabled={!config.localDateTime}
                                  value={config.localDateTime.slice(11, 13) || '00'}
                                  onChange={(event) =>
                                    setConfig({
                                      localDateTime: `${config.localDateTime.slice(0, 11)}${event.target.value}:${config.localDateTime.slice(14, 16)}`,
                                    })
                                  }
                                >
                                  {Array.from({ length: 24 }, (_, hour) =>
                                    String(hour).padStart(2, '0'),
                                  ).map((hour) => (
                                    <FormSelectOption key={hour} value={hour}>
                                      {hour}
                                    </FormSelectOption>
                                  ))}
                                </FormSelect>
                              </Field>
                              <Field>
                                <FieldLabel htmlFor="pw-minute">
                                  {t('pageWidgets.eventMinute')}
                                </FieldLabel>
                                <FormSelect
                                  id="pw-minute"
                                  disabled={!config.localDateTime}
                                  value={config.localDateTime.slice(14, 16) || '00'}
                                  onChange={(event) =>
                                    setConfig({
                                      localDateTime: `${config.localDateTime.slice(0, 14)}${event.target.value}`,
                                    })
                                  }
                                >
                                  {Array.from({ length: 60 }, (_, minute) =>
                                    String(minute).padStart(2, '0'),
                                  ).map((minute) => (
                                    <FormSelectOption key={minute} value={minute}>
                                      {minute}
                                    </FormSelectOption>
                                  ))}
                                </FormSelect>
                              </Field>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCalendarOpen(false)}
                              >
                                {t('pageWidgets.dateTimeDone')}
                              </Button>
                            </FieldGroup>
                          </PopoverContent>
                        </Popover>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="pw-countdown-zone">
                          {t('settings.ui.timeZone')}
                        </FieldLabel>
                        <FormSelect
                          id="pw-countdown-zone"
                          value={config.timeZone}
                          onChange={(event) => setConfig({ timeZone: event.target.value })}
                        >
                          <FormSelectOption value="">
                            {t('settings.ui.timeZoneBrowser', {
                              zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            })}
                          </FormSelectOption>
                          {listTimeZones().map((zone) => (
                            <FormSelectOption key={zone} value={zone}>
                              {zone}
                            </FormSelectOption>
                          ))}
                        </FormSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="pw-past">{t('pageWidgets.pastBehavior')}</FieldLabel>
                        <FormSelect
                          id="pw-past"
                          value={config.pastBehavior}
                          onChange={(event) =>
                            setConfig({
                              pastBehavior: event.target.value as CountdownConfig['pastBehavior'],
                            })
                          }
                        >
                          <FormSelectOption value="keep">
                            {t('pageWidgets.keepPast')}
                          </FormSelectOption>
                          <FormSelectOption value="hide">
                            {t('pageWidgets.hidePast')}
                          </FormSelectOption>
                        </FormSelect>
                      </Field>
                    </>
                  );
                })()}
              {draft.type === 'note' && (
                <Field>
                  <FieldLabel htmlFor="pw-note">{t('pageWidgets.noteText')}</FieldLabel>
                  <Textarea
                    id="pw-note"
                    rows={6}
                    maxLength={MAX_NOTE_LENGTH}
                    value={(draft.config as NoteConfig).text}
                    onChange={(event) =>
                      onChange({ ...draft, config: { ...draft.config, text: event.target.value } })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('pageWidgets.noteHint', { max: MAX_NOTE_LENGTH })}
                  </p>
                </Field>
              )}
              <Collapsible defaultOpen={draft.id !== null && draft.name !== ''}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="-ml-2">
                    {t('pageWidgets.details')}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="pw-name">{t('pageWidgets.name')}</FieldLabel>
                      <Input
                        id="pw-name"
                        maxLength={80}
                        value={draft.name}
                        onChange={(event) => onChange({ ...draft, name: event.target.value })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="pw-page">{t('pageWidgets.page')}</FieldLabel>
                      <FormSelect
                        id="pw-page"
                        value={String(draft.pageId)}
                        onChange={(event) =>
                          onChange({ ...draft, pageId: Number(event.target.value) })
                        }
                      >
                        {pages.map((page) => (
                          <FormSelectOption key={page.id} value={String(page.id)}>
                            {page.name}
                          </FormSelectOption>
                        ))}
                      </FormSelect>
                    </Field>
                  </FieldGroup>
                </CollapsibleContent>
              </Collapsible>
            </FieldGroup>
            {draft.type === 'clock' && (
              <aside
                aria-label={t('pageWidgets.preview')}
                className="flex flex-col gap-2 rounded-md bg-muted/50 p-3"
              >
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('pageWidgets.preview')}
                </span>
                <div className="flex flex-col gap-3 rounded-md border bg-card p-3">
                  <span className="truncate text-sm font-medium">{draft.name || clockName}</span>
                  <Clock preferences={draft.config as ClockConfig} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {t('pageWidgets.previewHint')}
                </span>
              </aside>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {draft.id === null ? (
              <Button type="button" variant="ghost" onClick={() => onChoose(false)}>
                <ArrowLeft />
                {t('pageWidgets.back')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('pages.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (draft.type === 'countdown' && !(draft.config as CountdownConfig).localDateTime)
                }
              >
                {draft.id === null ? t('pageWidgets.add') : t('widgets.save')}
              </Button>
            </div>
          </div>
        </form>
      )}
    </ResponsiveDialog>
  );
}

function GalleryOption({
  title,
  description,
  onPick,
  children,
}: {
  title: string;
  description: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-w-0 flex-col items-start gap-2 rounded-md border bg-card p-3 text-left transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="rounded bg-muted/60 px-2 py-1">{children}</span>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

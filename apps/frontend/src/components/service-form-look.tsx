import { ICON_MAX_LENGTH, type ServiceInput } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Field, FieldGroup, FieldLabel } from '@homora/ui/field';
import { IconPicker } from '@/components/icon-picker';
import { Input } from '@homora/ui/input';
import { ServiceIcon } from '@/components/service-icon';
import { TagInput } from '@/components/tag-input';
import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';
import { faviconUrl, suggestBrandIcon } from '@/lib/icons';
import { t } from '@/i18n';

type Props = {
  value: ServiceInput;
  onChange: (value: ServiceInput) => void;
  tags?: { value: string[]; onChange: (tags: string[]) => void };
};

/** How the card looks and opens: description, icon, tags and where the link opens. */
export function LookPanel({ value, onChange, tags }: Props) {
  const set = (patch: Partial<ServiceInput>) => onChange({ ...value, ...patch });
  const suggestion = suggestBrandIcon(value.name);
  const favicon = faviconUrl(value.url);
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="service-description">
          {t('form.description')}{' '}
          <small className="font-normal text-muted-foreground">{t('common.optional')}</small>
        </FieldLabel>
        <Input
          id="service-description"
          maxLength={140}
          autoComplete="off"
          value={value.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={t('form.descriptionPlaceholder')}
        />
      </Field>
      {tags && (
        <Field>
          <FieldLabel htmlFor="service-tags">
            {t('form.tags')}{' '}
            <small className="font-normal text-muted-foreground">{t('form.tagsHint')}</small>
          </FieldLabel>
          <TagInput id="service-tags" value={tags.value} onChange={tags.onChange} />
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="service-icon">
          {t('form.icon')}{' '}
          <small className="font-normal text-muted-foreground">{t('form.iconHint')}</small>
        </FieldLabel>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-lg font-semibold"
          >
            <ServiceIcon icon={value.icon} name={value.name || '?'} />
          </span>
          <Input
            id="service-icon"
            maxLength={ICON_MAX_LENGTH}
            autoComplete="off"
            className="min-w-0 flex-1"
            value={value.icon ?? ''}
            onChange={(e) => set({ icon: e.target.value })}
            placeholder={t('form.iconPlaceholder')}
          />
          <IconPicker iconOnly value={value.icon ?? ''} onChange={(icon) => set({ icon })} />
        </div>
        {!value.icon && suggestion && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => set({ icon: `brand:${suggestion}` })}
            >
              <ServiceIcon icon={`brand:${suggestion}`} name={value.name} />
              {t('icon.suggested', { icon: suggestion })}
            </Button>
          </div>
        )}
        {favicon && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set({ icon: favicon })}
            >
              {t('icon.favicon')}
            </Button>
          </div>
        )}
      </Field>
      <Field>
        <FieldLabel id="service-open-target-label">{t('form.openTarget')}</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="service-open-target-label"
          value={value.openTarget ?? 'new-tab'}
          onValueChange={(next) => {
            if (next === 'new-tab' || next === 'same-tab') set({ openTarget: next });
          }}
        >
          <ToggleGroupItem value="new-tab">{t('form.openNewTab')}</ToggleGroupItem>
          <ToggleGroupItem value="same-tab">{t('form.openSameTab')}</ToggleGroupItem>
        </ToggleGroup>
      </Field>
    </FieldGroup>
  );
}

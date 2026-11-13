import {
  ACCENT_IDS,
  ACCENT_PRESETS,
  BACKGROUND_IDS,
  BACKGROUND_PRESETS,
  type AccentId,
  type Appearance,
  type BackgroundId,
  type ThemeName,
} from '@homora/shared';
import { FormError } from '@/components/form-error';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { t, type MessageKey } from '@/i18n';
import { SettingRow } from './setting-row';

type Props = {
  draft: Appearance;
  hexText: string;
  hexValid: boolean;
  theme: ThemeName;
  onChange: (change: Partial<Appearance>) => void;
  onHexChange: (value: string) => void;
  onHexEdit: () => void;
};

const swatchBackground = (id: BackgroundId, theme: ThemeName) => {
  const stops = BACKGROUND_PRESETS[id]?.[theme];
  return stops ? `linear-gradient(160deg, ${stops.join(', ')})` : undefined;
};

/** Accent, custom HEX, and page-background controls. */
export function AppearanceColors({
  draft,
  hexText,
  hexValid,
  theme,
  onChange,
  onHexChange,
  onHexEdit,
}: Props) {
  return (
    <>
      <SettingRow label={t('appearance.accent')} description={t('appearance.accentHint')}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap sm:justify-end"
          aria-label={t('appearance.accent')}
          value={draft.accent}
          onValueChange={(next) => {
            if (next === 'custom' || (ACCENT_IDS as readonly string[]).includes(next))
              onChange({ accent: next as AccentId | 'custom' });
          }}
        >
          {ACCENT_IDS.map((id) => (
            <ToggleGroupItem
              key={id}
              value={id}
              title={t(`appearance.accent.${id}` as MessageKey)}
              className="size-9 min-w-9 rounded-full p-0 data-[state=on]:ring-2 data-[state=on]:ring-foreground pointer-coarse:size-11"
            >
              <span
                aria-hidden="true"
                className="size-6 rounded-full border"
                style={{ backgroundColor: ACCENT_PRESETS[id][theme] }}
              />
              <span className="sr-only">{t(`appearance.accent.${id}` as MessageKey)}</span>
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom" className="px-3 pointer-coarse:h-11">
            {t('appearance.accent.custom')}
          </ToggleGroupItem>
        </ToggleGroup>
      </SettingRow>
      {draft.accent === 'custom' && (
        <SettingRow
          htmlFor="appearance-hex"
          label={t('appearance.customHex')}
          description={t('appearance.customHexHint')}
        >
          <div className="flex w-full flex-col gap-1 sm:w-48">
            <Input
              id="appearance-hex"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              value={hexText}
              aria-invalid={hexValid ? undefined : true}
              aria-describedby="appearance-hex-error"
              onChange={(event) => {
                onHexEdit();
                onHexChange(event.target.value.trim());
              }}
            />
            <FormError id="appearance-hex-error">
              {hexValid ? '' : t('appearance.customHexInvalid')}
            </FormError>
          </div>
        </SettingRow>
      )}

      <SettingRow label={t('appearance.background')} description={t('appearance.backgroundHint')}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap sm:justify-end"
          aria-label={t('appearance.background')}
          value={draft.background}
          onValueChange={(next) => {
            if ((BACKGROUND_IDS as readonly string[]).includes(next))
              onChange({ background: next as BackgroundId });
          }}
        >
          {BACKGROUND_IDS.map((id) => (
            <ToggleGroupItem
              key={id}
              value={id}
              title={t(`appearance.background.${id}` as MessageKey)}
              className="h-11 w-16 min-w-16 p-1 data-[state=on]:ring-2 data-[state=on]:ring-foreground"
            >
              <span
                aria-hidden="true"
                className="block size-full rounded-sm border bg-background"
                style={{ backgroundImage: swatchBackground(id, theme) }}
              />
              <span className="sr-only">{t(`appearance.background.${id}` as MessageKey)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingRow>
    </>
  );
}

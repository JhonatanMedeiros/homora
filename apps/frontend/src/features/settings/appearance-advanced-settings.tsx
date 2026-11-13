import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Appearance, BackgroundImage, ImagePosition } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { SettingRow } from './setting-row';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { Segmented } from './segmented';
import { t, type MessageKey } from '@/i18n';
import {
  CARD_OPACITY_MAX,
  CARD_OPACITY_MIN,
  CARD_OPACITY_STEP,
  IMAGE_DIM_MAX,
  IMAGE_DIM_STEP,
  IMAGE_POSITIONS,
} from '@homora/shared';

const OPACITIES = Array.from(
  { length: (CARD_OPACITY_MAX - CARD_OPACITY_MIN) / CARD_OPACITY_STEP + 1 },
  (_, index) => CARD_OPACITY_MIN + index * CARD_OPACITY_STEP,
);

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function AppearanceAdvancedSettings({
  phone,
  saved,
  draft,
  busy,
  imageBusy,
  onSend,
  onRemoveImage,
  onChange,
  onChangeImage,
}: {
  phone: boolean;
  saved: Appearance;
  draft: Appearance;
  busy: boolean;
  imageBusy: boolean;
  onSend: (file: File) => void;
  onRemoveImage: () => void;
  onChange: (change: Partial<Appearance>) => void;
  onChangeImage: (change: Partial<BackgroundImage>) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="flex h-auto w-full justify-between p-4 text-left"
        >
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('settings.ui.advanced')}</span>
            <span className="text-sm text-muted-foreground">{t('appearance.advancedHint')}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={
              open ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'
            }
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border border-t">
        <SettingRow label={t('appearance.image')} description={t('appearance.imageHint')}>
          {phone ? (
            <p className="max-w-[40ch] text-sm text-muted-foreground">
              {t('appearance.imagePhone')}
            </p>
          ) : (
            <div
              data-testid="image-dropzone"
              data-dragging={dragging || undefined}
              className="flex w-full flex-col items-start gap-2 rounded-lg border border-dashed p-3 data-[dragging=true]:border-primary sm:w-80"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file && !busy) onSend(file);
              }}
            >
              <p className="text-sm text-muted-foreground">{t('appearance.imageDrop')}</p>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-label={t('appearance.imageChoose')}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onSend(file);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-11"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  {imageBusy && <Spinner data-icon="inline-start" />}
                  {t(saved.image ? 'appearance.imageReplace' : 'appearance.imageChoose')}
                </Button>
                {saved.image && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="pointer-coarse:h-11"
                    disabled={busy}
                    onClick={onRemoveImage}
                  >
                    {t('appearance.imageRemove')}
                  </Button>
                )}
              </div>
              <p aria-live="polite" className="text-sm">
                {imageBusy
                  ? t('appearance.imageWorking')
                  : saved.image
                    ? t('appearance.imageSizes', {
                        before: formatBytes(saved.image.originalBytes),
                        after: formatBytes(saved.image.bytes),
                        width: saved.image.width,
                        height: saved.image.height,
                      })
                    : t('appearance.imageNone')}
              </p>
            </div>
          )}
        </SettingRow>
        {draft.image && (
          <>
            <SettingRow label={t('appearance.imageDim')} description={t('appearance.imageDimHint')}>
              <div className="flex w-full items-center gap-3 sm:w-64">
                <Slider
                  aria-label={t('appearance.imageDim')}
                  min={0}
                  max={IMAGE_DIM_MAX}
                  step={IMAGE_DIM_STEP}
                  disabled={phone}
                  value={[draft.image.dim]}
                  onValueChange={([dim]) => {
                    if (dim !== undefined) onChangeImage({ dim });
                  }}
                />
                <span className="w-12 text-right font-mono text-sm">
                  {t('appearance.imageDimValue', { value: draft.image.dim })}
                </span>
              </div>
            </SettingRow>
            <SettingRow label={t('appearance.imagePosition')}>
              <Segmented<ImagePosition>
                label={t('appearance.imagePosition')}
                value={draft.image.position}
                onChange={(position) => onChangeImage({ position })}
                options={IMAGE_POSITIONS.map((position) => ({
                  value: position,
                  label: t(`appearance.imagePosition.${position}` as MessageKey),
                }))}
              />
            </SettingRow>
          </>
        )}
        <SettingRow
          htmlFor="appearance-opacity"
          label={t('appearance.cardOpacity')}
          description={t('appearance.cardOpacityHint')}
        >
          <FormSelect
            id="appearance-opacity"
            aria-label={t('appearance.cardOpacity')}
            className="sm:w-32"
            value={draft.cardOpacity}
            onChange={(event) => onChange({ cardOpacity: Number(event.target.value) })}
          >
            {OPACITIES.map((value) => (
              <FormSelectOption key={value} value={value}>
                {t('appearance.cardOpacityOption', { value })}
              </FormSelectOption>
            ))}
          </FormSelect>
        </SettingRow>
        <SettingRow
          htmlFor="appearance-blur"
          label={t('appearance.blur')}
          description={t('appearance.blurHint')}
        >
          <Switch
            id="appearance-blur"
            checked={draft.blur}
            onCheckedChange={(blur) => onChange({ blur })}
          />
        </SettingRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

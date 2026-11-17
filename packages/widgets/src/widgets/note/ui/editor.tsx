import { useWidgetHost } from '../../../ui/host.js';
import { Field, FieldLabel } from '@homora/ui/field';
import { Textarea } from '@homora/ui/textarea';
import { MAX_NOTE_LENGTH, type NoteConfig } from '../../../note.js';
export function Editor({
  config,
  onChange,
}: {
  config: NoteConfig;
  onChange: (config: NoteConfig) => void;
}) {
  const { t } = useWidgetHost();
  const setConfig = (patch: Partial<NoteConfig>) => onChange({ ...config, ...patch });
  return (
    <>
      <Field>
        <FieldLabel htmlFor="pw-note">{t('pageWidgets.noteText')}</FieldLabel>
        <Textarea
          id="pw-note"
          rows={6}
          maxLength={MAX_NOTE_LENGTH}
          value={config.text}
          onChange={(event) => setConfig({ text: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {t('pageWidgets.noteHint', { max: MAX_NOTE_LENGTH })}
        </p>
      </Field>
    </>
  );
}

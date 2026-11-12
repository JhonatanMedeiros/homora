import { X } from 'lucide-react';
import type { Service } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelect } from '@/components/native-select';
import { t } from '@/i18n';

type Props = {
  /** The card being edited, excluded from the choices; null while creating a card. */
  selfId: number | null;
  services: Service[];
  value: number[];
  onChange: (value: number[]) => void;
};

/**
 * "Depends on" in the service form: the same data the map edits by picking, with no pointer or
 * drag needed. Changes are saved with the form.
 */
export function DependencyPicker({ selfId, services, value, onChange }: Props) {
  const choices = services
    .filter((service) => service.id !== selfId && !value.includes(service.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: number) => services.find((service) => service.id === id)?.name ?? `#${id}`;
  return (
    <Field className="sm:col-span-2">
      <FieldLabel htmlFor="service-dependency">{t('dependencies.title')}</FieldLabel>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((id) => (
            <li
              key={id}
              className="inline-flex items-center gap-1 rounded-md border bg-card py-1 pr-1 pl-3 text-sm"
            >
              {nameOf(id)}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="pointer-coarse:size-11"
                aria-label={t('dependencies.remove', { name: nameOf(id) })}
                onClick={() => onChange(value.filter((item) => item !== id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <FieldDescription>{t('dependencies.none')}</FieldDescription>
      )}
      <div className="flex items-center gap-2">
        <NativeSelect
          id="service-dependency"
          value=""
          disabled={choices.length === 0}
          onChange={(event) => {
            const id = Number(event.target.value);
            if (id) onChange([...value, id]);
          }}
        >
          <option value="">{t('dependencies.choose')}</option>
          {choices.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <FieldDescription>{t('dependencies.hint')}</FieldDescription>
    </Field>
  );
}

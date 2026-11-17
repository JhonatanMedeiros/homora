import { FormSelect, FormSelectOption } from '@/components/form-select';
import { Input } from '@homora/ui/input';
import { t } from '@/i18n';
import { useHostNodeOptions } from '@/features/hosts/use-host-node-options';

type Props = { id: string; connectionId: number; value: string; onChange: (value: string) => void };

/**
 * Chooses a host node to scope widgets and the top bar to, from the saved connection's
 * inventory. If the inventory cannot be read it falls back to a text field, so the scope can still
 * be changed or cleared.
 */
export function NodePicker({ id, connectionId, value, onChange }: Props) {
  const names = useHostNodeOptions(connectionId);
  if (names === 'failed')
    return (
      <Input
        id={id}
        maxLength={63}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  return (
    <FormSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <FormSelectOption value="">{t('connections.nodeAll')}</FormSelectOption>
      {names.map((name) => (
        <FormSelectOption key={name} value={name}>
          {name}
        </FormSelectOption>
      ))}
      {value !== '' && !names.includes(value) && (
        <FormSelectOption value={value}>
          {t('connections.nodeMissing', { name: value })}
        </FormSelectOption>
      )}
    </FormSelect>
  );
}

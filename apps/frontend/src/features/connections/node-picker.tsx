import { useEffect, useState } from 'react';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';

type Props = { id: string; connectionId: number; value: string; onChange: (value: string) => void };

/**
 * Chooses the Proxmox node to scope widgets and the top bar to, from the saved connection's
 * inventory. If the inventory cannot be read it falls back to a text field, so the scope can still
 * be changed or cleared.
 */
export function NodePicker({ id, connectionId, value, onChange }: Props) {
  const [names, setNames] = useState<string[] | 'failed'>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/connections/${connectionId}/guests`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = response.ok ? await response.json() : null;
        const nodes =
          body && typeof body === 'object' ? (body as { nodes?: unknown }).nodes : undefined;
        if (controller.signal.aborted) return;
        if (!Array.isArray(nodes)) return setNames('failed');
        setNames(
          nodes
            .map((node) => (node as { name?: unknown } | null)?.name)
            .filter((name): name is string => typeof name === 'string'),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setNames('failed');
      });
    return () => controller.abort();
  }, [connectionId]);
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

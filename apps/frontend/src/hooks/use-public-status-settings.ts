import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import type { PublicStatus } from '@/features/public-status/public-status-model';

type Admin = { enabled: boolean; title: string; description: string; preview: PublicStatus };
type Message = { kind: 'ok' | 'error'; text: string };

/** Public status administration state and API operations for its settings screen. */
export function usePublicStatusSettings() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public-status/admin', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Admin>) : null))
      .then((data) => {
        if (data) {
          setAdmin(data);
          setTitle(data.title);
          setDescription(data.description ?? '');
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function update(patch: { enabled?: boolean; title?: string; description?: string }) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/public-status/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Admin;
      setAdmin(data);
      setTitle(data.title);
      setDescription(data.description ?? '');
      setMessage({ kind: 'ok', text: t('settings.public.saved') });
    } catch {
      setMessage({ kind: 'error', text: t('settings.public.error') });
    } finally {
      setSaving(false);
    }
  }

  return {
    admin,
    title,
    setTitle,
    description,
    setDescription,
    message,
    setMessage,
    saving,
    update,
  };
}

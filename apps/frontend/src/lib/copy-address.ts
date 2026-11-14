import { toast } from 'sonner';
import { t } from '@/i18n';

/** Copies an address; falls back to a message with the text when the browser refuses. */
export async function copyAddress(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success(t('links.copied'));
  } catch {
    toast(t('links.copyFailed', { url }));
  }
}

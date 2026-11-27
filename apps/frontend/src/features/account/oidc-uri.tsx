import { CopyButton } from '@/components/copy-button';
import { t } from '@/i18n';

/** An address to be copied exactly, such as the redirect URL registered at the provider. */
export function OidcAddress({ value }: { value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
      <CopyButton text={value} label={t('account.oidcCopy')} size="sm" />
    </div>
  );
}

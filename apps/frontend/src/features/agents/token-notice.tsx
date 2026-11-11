import { Check, Copy, KeyRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

type Props = { token: string; copied: boolean; onCopy: () => void; onDismiss: () => void };

/** New token, displayed only once. */
export function TokenNotice({ token, copied, onCopy, onDismiss }: Props) {
  return (
    <Alert role="alert" className="border-primary">
      <KeyRound aria-hidden="true" />
      <AlertTitle>{t('token.title')}</AlertTitle>
      <AlertDescription className="gap-3 text-foreground">
        <span>{t('token.once')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
            {token}
          </code>
          <Button type="button" variant="secondary" size="sm" onClick={onCopy}>
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? t('token.copied') : t('token.copy')}
          </Button>
        </div>
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            {t('token.saved')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

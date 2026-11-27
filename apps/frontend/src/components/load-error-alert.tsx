import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { t } from '@/i18n';

/** The service list could not be read: say so, and offer to try again. */
export function LoadErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {message}
        <Button type="button" variant="link" onClick={onRetry}>
          {t('catalog.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { useCustomCss } from '@/hooks/use-custom-css';
import { t } from '@/i18n';

/**
 * Shown while this tab runs without the custom stylesheet (`?safe=1`). It is the way back from a
 * stylesheet that hides something important: turn it off here, or open the editor to fix it.
 */
export function SafeModeBanner({ onEdit }: { onEdit: () => void }) {
  const { safe, enabled, setEnabled, leaveSafeMode } = useCustomCss();
  if (!safe) return null;
  return (
    <Alert data-homora="safe-mode-banner" className="mb-6">
      <ShieldAlert aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium text-foreground">{t('css.safe.title')}</span>
        <span className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="pointer-coarse:h-11"
            disabled={!enabled}
            onClick={() =>
              void setEnabled(false).then((result) => {
                if (result.ok) toast.success(t('css.turnedOff'));
              })
            }
          >
            {t('css.safe.off')}
          </Button>
          <Button size="sm" variant="outline" className="pointer-coarse:h-11" onClick={onEdit}>
            {t('css.safe.edit')}
          </Button>
          <Button size="sm" variant="ghost" className="pointer-coarse:h-11" onClick={leaveSafeMode}>
            {t('css.safe.leave')}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

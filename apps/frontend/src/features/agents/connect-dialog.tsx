import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { ConnectGuide } from './connect-guide';
import { cn } from '@homora/ui/lib/utils';
import { SHEET_CLASS } from './sheet-class';
import { t } from '@/i18n';

/** The setup guide on its own: the token is not available after creation, so it uses a placeholder. */
export function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(SHEET_CLASS, 'sm:max-w-2xl')}>
        <DialogHeader>
          <DialogTitle>{t('guide.title')}</DialogTitle>
          <DialogDescription>{t('guide.description')}</DialogDescription>
        </DialogHeader>
        <ConnectGuide />
      </DialogContent>
    </Dialog>
  );
}

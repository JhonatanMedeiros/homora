import { toast } from 'sonner';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { ConnectGuide } from './connect-guide';
import { cn } from '@/lib/utils';
import { SHEET_CLASS } from './sheet-class';
import { t } from '@/i18n';

type Props = {
  token: string;
  agentName: string;
  onDone: () => void;
};

/** Step 2: the token is shown once, next to the setup guide that already includes it. */
export function TokenDialog({ token, agentName, onDone }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
      toast.error(t('agents.copyFailed'));
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (open) return;
          if (saved) onDone();
          else setConfirmClose(true);
        }}
      >
        <DialogContent className={cn(SHEET_CLASS, 'sm:max-w-2xl')}>
          <DialogHeader>
            <DialogTitle>{t('token.dialogTitle', { name: agentName })}</DialogTitle>
            <DialogDescription>{t('token.once')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
              {token}
            </code>
            <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
              {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {copied ? t('token.copied') : t('token.copy')}
            </Button>
          </div>
          {copyFailed && (
            <p role="status" className="text-sm text-destructive">
              {t('agents.copyFailed')}
            </p>
          )}
          <ConnectGuide token={token} />
          <Field orientation="horizontal">
            <Checkbox
              id="token-saved"
              checked={saved}
              onCheckedChange={(checked) => setSaved(checked === true)}
            />
            <FieldLabel htmlFor="token-saved">{t('token.saved')}</FieldLabel>
          </Field>
          <DialogFooter>
            <Button type="button" disabled={!saved} onClick={onDone}>
              {t('token.finish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('token.closeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('token.closeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('token.back')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDone}>
              {t('token.closeAnyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

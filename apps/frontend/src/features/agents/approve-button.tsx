import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

/**
 * The approve button of a proposal or batch. A destructive change asks first, so a stray click
 * cannot remove or revoke anything; every other change applies with a single click.
 */
export function ApproveButton({
  confirm,
  description,
  disabled,
  onApprove,
  children,
}: {
  confirm: boolean;
  description: string;
  disabled?: boolean;
  onApprove: () => void;
  children: ReactNode;
}) {
  if (!confirm)
    return (
      <Button type="button" disabled={disabled} onClick={onApprove}>
        {children}
      </Button>
    );
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('proposal.confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onApprove}>{t('proposal.confirmAction')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

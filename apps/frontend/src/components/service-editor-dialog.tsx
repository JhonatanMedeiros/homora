import type { ComponentProps, RefObject } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ServiceForm } from '@/components/service-form';
import { t } from '@/i18n';

type ServiceFormProps = ComponentProps<typeof ServiceForm>;

type Props = {
  open: boolean;
  saving: boolean;
  editing: number | null;
  nameRef: RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onFocusEditTrigger: (id: number | null) => void;
  formProps: Omit<ServiceFormProps, 'editing' | 'nameRef'>;
};

export function ServiceEditorDialog({
  open,
  saving,
  editing,
  nameRef,
  onOpenChange,
  onFocusEditTrigger,
  formProps,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nameRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onFocusEditTrigger(editing);
        }}
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-label text-xl">
            {editing !== null ? t('form.editTitle') : t('form.newTitle')}
          </DialogTitle>
          <DialogDescription>{t('form.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <ServiceForm {...formProps} nameRef={nameRef} editing={editing !== null} />
      </DialogContent>
    </Dialog>
  );
}

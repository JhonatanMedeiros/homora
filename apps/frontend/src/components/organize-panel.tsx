import type { FormEvent } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Props = {
  /** Ao renomear, o formulário de novo grupo dá lugar ao de renomear. */
  renaming: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancelRename: () => void;
};

/** Faixa do modo Organizar: instrução, criar grupo e renomear grupo. */
export function OrganizePanel({ renaming, draft, onDraftChange, onSubmit, onCancelRename }: Props) {
  return (
    <>
      <Alert role="group" aria-label="Modo organizar">
        <SlidersHorizontal aria-hidden="true" />
        <AlertDescription className="flex flex-col gap-3 text-foreground">
          <span>
            Você está organizando. Arraste os cards ou use as setas para mudar a ordem e toque em
            Concluir ao terminar.
          </span>
          {!renaming && (
            <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
              <Field className="w-auto min-w-48 flex-1">
                <FieldLabel htmlFor="new-group">Novo grupo</FieldLabel>
                <Input
                  id="new-group"
                  data-group-input
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  maxLength={40}
                  placeholder="Ex.: Casa"
                />
              </Field>
              <Button data-group-add type="submit" variant="secondary" disabled={!draft.trim()}>
                Criar grupo
              </Button>
            </form>
          )}
        </AlertDescription>
      </Alert>
      {renaming && (
        <form
          aria-label="Renomear grupo"
          onSubmit={onSubmit}
          className="flex flex-wrap items-end gap-2"
        >
          <Field className="w-auto min-w-48 flex-1">
            <FieldLabel htmlFor="rename-group">Novo nome do grupo</FieldLabel>
            <Input
              id="rename-group"
              autoFocus
              maxLength={40}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </Field>
          <Button type="submit">Salvar nome</Button>
          <Button type="button" variant="ghost" onClick={onCancelRename}>
            Cancelar
          </Button>
        </form>
      )}
    </>
  );
}

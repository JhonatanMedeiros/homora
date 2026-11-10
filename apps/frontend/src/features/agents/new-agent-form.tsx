import { useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SCOPES } from './agent-model';

type Props = {
  /** Aberto por padrão quando ainda não existe nenhuma identidade. */
  defaultOpen: boolean;
  name: string;
  scopes: string[];
  onNameChange: (name: string) => void;
  onScopeChange: (id: string, checked: boolean) => void;
  onSubmit: (event: FormEvent) => void;
};

export function NewAgentForm({
  defaultOpen,
  name,
  scopes,
  onNameChange,
  onScopeChange,
  onSubmit,
}: Props) {
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? defaultOpen;
  return (
    <Collapsible open={isOpen} onOpenChange={setOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="w-full justify-between">
          Nova identidade
          <ChevronDown data-icon="inline-end" className={isOpen ? 'rotate-180' : undefined} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form onSubmit={onSubmit} className="border-t p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="agent-name">Nome do agente</FieldLabel>
              <Input
                id="agent-name"
                required
                maxLength={60}
                autoComplete="off"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Ex.: Assistente da casa"
              />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">O que ele pode fazer</FieldLegend>
              <FieldGroup className="gap-3">
                {SCOPES.map((scope) => (
                  <Field key={scope.id} orientation="horizontal" className="items-start">
                    <Checkbox
                      id={`scope-${scope.id}`}
                      checked={scopes.includes(scope.id)}
                      onCheckedChange={(checked) => onScopeChange(scope.id, checked === true)}
                    />
                    <div className="flex flex-col gap-1">
                      <FieldLabel htmlFor={`scope-${scope.id}`}>{scope.label}</FieldLabel>
                      <FieldDescription>{scope.hint}</FieldDescription>
                    </div>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
            <div className="flex justify-end">
              <Button type="submit" disabled={!name.trim()}>
                Criar identidade
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}

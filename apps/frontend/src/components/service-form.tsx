import { forwardRef, type FormEvent } from 'react';
import type { ServiceInput } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/form-error';

type Props = {
  editing: boolean;
  value: ServiceInput;
  categories: string[];
  error: string;
  saving: boolean;
  nameRef: React.Ref<HTMLInputElement>;
  onChange: (value: ServiceInput) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export const ServiceForm = forwardRef<HTMLFormElement, Props>(function ServiceForm(
  { editing, value, categories, error, saving, nameRef, onChange, onSubmit, onCancel },
  ref,
) {
  const set = (patch: Partial<ServiceInput>) => onChange({ ...value, ...patch });
  return (
    <form ref={ref} aria-labelledby="form-title" onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle id="form-title" className="font-label text-xl">
            {editing ? 'Editar serviço' : 'Novo serviço'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="service-name">Nome</FieldLabel>
              <Input
                ref={nameRef}
                id="service-name"
                required
                maxLength={80}
                autoComplete="off"
                value={value.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Jellyfin"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-url">URL</FieldLabel>
              <Input
                id="service-url"
                type="url"
                inputMode="url"
                required
                autoComplete="off"
                value={value.url}
                onChange={(e) => set({ url: e.target.value })}
                placeholder="http://192.168.1.10:8096"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-category">Categoria</FieldLabel>
              <Input
                id="service-category"
                required
                maxLength={40}
                list="categories"
                autoComplete="off"
                value={value.category}
                onChange={(e) => set({ category: e.target.value })}
                placeholder="Mídia"
              />
              <datalist id="categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="service-description">
                Descrição <small className="font-normal text-muted-foreground">opcional</small>
              </FieldLabel>
              <Input
                id="service-description"
                maxLength={140}
                autoComplete="off"
                value={value.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Filmes e séries"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-icon">
                Ícone <small className="font-normal text-muted-foreground">emoji opcional</small>
              </FieldLabel>
              <Input
                id="service-icon"
                maxLength={8}
                value={value.icon ?? ''}
                onChange={(e) => set({ icon: e.target.value })}
                placeholder="🎬"
              />
            </Field>
            <Field orientation="horizontal" className="items-start sm:col-span-2">
              <Checkbox
                id="service-private"
                checked={value.allowPrivate === true}
                onCheckedChange={(checked) => set({ allowPrivate: checked === true })}
              />
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="service-private">
                  Permitir monitoramento em rede privada
                </FieldLabel>
                <FieldDescription>
                  Útil para endereços da sua rede local, como 192.168.x.x. Vale só para este
                  serviço.
                </FieldDescription>
              </div>
            </Field>
          </FieldGroup>
          <FormError className="mt-3">{error}</FormError>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {editing ? 'Salvar alterações' : 'Salvar serviço'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
});

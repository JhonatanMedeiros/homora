import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Props = {
  configured: boolean;
  hasCa: boolean;
  busy: boolean;
  url: string;
  tokenId: string;
  secret: string;
  removeCa: boolean;
  onUrl: (value: string) => void;
  onTokenId: (value: string) => void;
  onSecret: (value: string) => void;
  onRemoveCa: (value: boolean) => void;
  onCaFile: (input: HTMLInputElement) => void;
  onSubmit: (event: FormEvent, test?: boolean) => void;
  onCancel: () => void;
};

/** Credenciais de leitura do Proxmox, com CA opcional e teste sem salvar. */
export function ProxmoxForm(p: Props) {
  return (
    <form onSubmit={(e) => p.onSubmit(e)}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="proxmox-url">URL HTTPS</FieldLabel>
          <Input
            id="proxmox-url"
            type="url"
            required={!p.configured}
            placeholder="https://pve.local:8006"
            value={p.url}
            onChange={(e) => p.onUrl(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="proxmox-token-id">ID do token</FieldLabel>
          <Input
            id="proxmox-token-id"
            required={!p.configured}
            placeholder="usuario@realm!token"
            value={p.tokenId}
            onChange={(e) => p.onTokenId(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="proxmox-secret">Segredo do token</FieldLabel>
          <Input
            id="proxmox-secret"
            type="password"
            required={!p.configured}
            value={p.secret}
            onChange={(e) => p.onSecret(e.target.value)}
          />
          {p.configured && (
            <FieldDescription>
              Deixe os campos em branco para manter os dados existentes. Ao alterar a URL ou o ID do
              token, informe novamente o segredo.
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="proxmox-ca">Certificado público da CA (opcional, PEM)</FieldLabel>
          <Input
            id="proxmox-ca"
            type="file"
            accept=".pem,.crt,.cer"
            onChange={(event) => p.onCaFile(event.target)}
          />
          <FieldDescription>
            Para a CA padrão do Proxmox, importe o arquivo público /etc/pve/pve-root-ca.pem obtido
            de fonte confiável. A URL deve corresponder ao certificado.
          </FieldDescription>
        </Field>
        {p.hasCa && (
          <Field orientation="horizontal">
            <Checkbox
              id="proxmox-remove-ca"
              checked={p.removeCa}
              onCheckedChange={(checked) => p.onRemoveCa(checked === true)}
            />
            <FieldLabel htmlFor="proxmox-remove-ca">Remover CA importada</FieldLabel>
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={p.busy}
            onClick={(event) => p.onSubmit(event, true)}
          >
            Testar conexão
          </Button>
          <Button type="submit" disabled={p.busy}>
            Salvar integração
          </Button>
          <Button type="button" variant="ghost" onClick={p.onCancel}>
            Cancelar
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

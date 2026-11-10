import { PasswordInput } from '@/components/password-input';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';

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
          <FieldLabel htmlFor="proxmox-url">{t('proxmox.url')}</FieldLabel>
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
          <FieldLabel htmlFor="proxmox-token-id">{t('proxmox.tokenId')}</FieldLabel>
          <Input
            id="proxmox-token-id"
            required={!p.configured}
            placeholder={t('proxmox.tokenIdPlaceholder')}
            value={p.tokenId}
            onChange={(e) => p.onTokenId(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="proxmox-secret">{t('proxmox.secret')}</FieldLabel>
          <PasswordInput
            id="proxmox-secret"
            required={!p.configured}
            value={p.secret}
            onChange={(e) => p.onSecret(e.target.value)}
          />
          {p.configured && <FieldDescription>{t('proxmox.keepHint')}</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="proxmox-ca">{t('proxmox.ca')}</FieldLabel>
          <Input
            id="proxmox-ca"
            type="file"
            accept=".pem,.crt,.cer"
            onChange={(event) => p.onCaFile(event.target)}
          />
          <FieldDescription>{t('proxmox.caHint')}</FieldDescription>
        </Field>
        {p.hasCa && (
          <Field orientation="horizontal">
            <Checkbox
              id="proxmox-remove-ca"
              checked={p.removeCa}
              onCheckedChange={(checked) => p.onRemoveCa(checked === true)}
            />
            <FieldLabel htmlFor="proxmox-remove-ca">{t('proxmox.removeCa')}</FieldLabel>
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={p.busy}
            onClick={(event) => p.onSubmit(event, true)}
          >
            {t('proxmox.test')}
          </Button>
          <Button type="submit" disabled={p.busy}>
            {t('proxmox.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={p.onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

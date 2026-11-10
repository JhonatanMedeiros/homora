import { Check, Copy, KeyRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Props = { token: string; copied: boolean; onCopy: () => void; onDismiss: () => void };

/** Token novo, mostrado uma única vez. */
export function TokenNotice({ token, copied, onCopy, onDismiss }: Props) {
  return (
    <Alert role="alert" className="border-primary">
      <KeyRound aria-hidden="true" />
      <AlertTitle>Copie o token agora.</AlertTitle>
      <AlertDescription className="gap-3 text-foreground">
        <span>Ele não será mostrado de novo.</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
            {token}
          </code>
          <Button type="button" variant="secondary" size="sm" onClick={onCopy}>
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Já guardei
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

import { ChevronDown } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { t } from '@/i18n';

// Local recovery only (see `scripts/auth-reset.mjs`): there is no remote bypass. Without --yes
// the script just shows the account it would remove, so the copied commands are safe to run.
const commands = [
  ['auth.forgotCompose', 'docker compose exec backend bun scripts/auth-reset.mjs'],
  ['auth.forgotSource', 'bun run auth:reset'],
] as const;

/** Explains how to recover a lost password, which can only be done on the server. */
export function ForgotPassword() {
  return (
    <Collapsible className="group/forgot mt-4 border-t pt-4">
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {t('auth.forgotPassword')}
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-data-[state=open]/forgot:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="motion-panel mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
        <p>{t('auth.forgotIntro')}</p>
        {commands.map(([label, command]) => (
          <div key={command} className="flex flex-col gap-1.5">
            <span className="text-xs">{t(label)}</span>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 rounded-md border bg-muted px-2.5 py-2 font-mono text-xs break-all text-foreground">
                {command}
              </code>
              <CopyButton
                size="sm"
                text={command}
                label={t('auth.forgotCopy')}
                doneLabel={t('auth.forgotCopied')}
              />
            </div>
          </div>
        ))}
        <p>{t('auth.forgotConfirm')}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

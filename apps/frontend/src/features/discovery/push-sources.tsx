import { Plus, RefreshCw, Server } from 'lucide-react';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@homora/ui/empty';
import { CopyButton } from '@/components/copy-button';
import { t } from '@/i18n';
import { PushSourceList } from './push-source-list';
import { PushSourceDialogs } from './push-source-dialogs';
import { usePushSources } from '@/hooks/use-push-sources';

const MAX_SOURCES = 10;
/** The agent's run command, with this page's origin filled in for the reader to adjust. */
const agentCommand = (
  origin: string,
) => `docker run -d --name homora-discovery-agent --restart unless-stopped \\
  --user "$(id -u):$(id -g)" --group-add "$(stat -c '%g' /var/run/docker.sock)" \\
  -e HOMORA_AGENT_ORIGIN=${origin} \\
  -e HOMORA_AGENT_TOKEN_FILE=/run/secrets/homora-token \\
  -v /path/to/protected-token:/run/secrets/homora-token:ro \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  homora-discovery-agent:local`;

/** Remote Docker agents: one source per host, each with a token and its own inventory. */
export function PushSources({ onImported }: { onImported: () => void | Promise<void> }) {
  const state = usePushSources(onImported);
  const { sources, error, busy, message, load, run, review, setConfirm } = state;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[65ch] text-sm text-muted-foreground">{t('push.hint')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm text-muted-foreground tabular-nums">
          {t('push.sourcesCount', { count: sources.length })}
          {sources.length >= MAX_SOURCES && ` · ${t('push.limit')}`}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void run(load)}
          >
            <RefreshCw data-icon="inline-start" />
            {t('push.refresh')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || sources.length >= MAX_SOURCES}
            onClick={() => state.setAdding(true)}
          >
            <Plus data-icon="inline-start" />
            {t('push.add')}
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {sources.length === 0 ? (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Server aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t('push.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('push.emptyHint')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <p className="sr-only">{t('push.empty')}</p>
          </EmptyContent>
        </Empty>
      ) : (
        <PushSourceList
          sources={sources}
          busy={busy}
          onReview={(source) => void review(source)}
          onChange={(source, actionName) => setConfirm({ source, action: actionName })}
        />
      )}
      <Collapsible className="rounded-lg border bg-card">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm font-medium">
          {t('push.setup')}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-sm text-muted-foreground">{t('push.setupHint')}</p>
          <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs">
            {agentCommand(window.location.origin)}
          </pre>
          <div>
            <CopyButton
              size="sm"
              text={agentCommand(window.location.origin)}
              label={t('settings.copy')}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <PushSourceDialogs state={state} />
    </div>
  );
}

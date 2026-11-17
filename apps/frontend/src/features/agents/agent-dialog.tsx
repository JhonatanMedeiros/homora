import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { eventTitleKey, type ActivityEvent } from '@/features/activity/activity-model';
import { formatAgo, t } from '@/i18n';
import { isWriteScope, parseScopes, scopeLabel, type Agent } from './agent-model';

type Confirm = 'rotate' | 'revoke' | null;

function Scopes({ title, scopes, empty }: { title: string; scopes: string[]; empty?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {scopes.length === 0 && empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {scopes.map((scope) => (
            <li key={scope}>
              <Badge variant="secondary">{scopeLabel(scope)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What an agent can do, what it did lately, and the actions on it. */
export function AgentDialog({
  agent,
  events,
  onClose,
  onConnect,
  onRotate,
  onRevoke,
}: {
  agent: Agent | null;
  /** This agent's audited events, newest first. */
  events: ActivityEvent[];
  onClose: () => void;
  onConnect: () => void;
  onRotate: (agent: Agent) => Promise<void>;
  onRevoke: (agent: Agent) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const scopes = agent ? parseScopes(agent.scopes) : [];
  const close = () => {
    setConfirm(null);
    onClose();
  };
  const run = (action: (agent: Agent) => Promise<void>) => {
    if (!agent) return;
    close();
    void action(agent);
  };
  return (
    <ResponsiveDialog
      open={agent !== null}
      onOpenChange={(open) => !open && close()}
      title={agent?.name ?? ''}
      description={agent?.revokedAt ? t('agents.revoked') : t('agents.active')}
    >
      {agent && (
        <div className="flex flex-col gap-5">
          <Scopes
            title={t('agents.canRead')}
            scopes={scopes.filter((scope) => !isWriteScope(scope))}
          />
          <Scopes
            title={t('agents.canSuggest')}
            scopes={scopes.filter(isWriteScope)}
            empty={t('agents.suggestNone')}
          />
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('agents.recentActivity')}</h3>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('agents.activityEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {events.slice(0, 5).map((event) => (
                  <li key={event.id} className="flex justify-between gap-3">
                    <span>{t(eventTitleKey(event))}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatAgo(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/manage/activity" className="w-fit text-sm underline underline-offset-4">
              {t('agents.activityAll')}
            </Link>
          </section>
          {!agent.revokedAt &&
            (confirm ? (
              <div
                role="alertdialog"
                aria-label={confirmTitle(confirm, agent)}
                className="flex flex-col gap-3 rounded-lg border p-3"
              >
                <p className="font-semibold">{confirmTitle(confirm, agent)}</p>
                <p className="text-sm text-muted-foreground">
                  {t(confirm === 'rotate' ? 'agents.rotateBody' : 'agents.revokeBody')}
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="button"
                    variant={confirm === 'revoke' ? 'destructive' : 'default'}
                    onClick={() => run(confirm === 'rotate' ? onRotate : onRevoke)}
                  >
                    {t(confirm === 'rotate' ? 'agents.newToken' : 'agents.revokeConfirm')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={onConnect}>
                  {t('agents.howToConnect')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setConfirm('rotate')}>
                  {t('agents.newToken')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive sm:ml-auto"
                  onClick={() => setConfirm('revoke')}
                >
                  {t('agents.revoke')}
                </Button>
              </div>
            ))}
        </div>
      )}
    </ResponsiveDialog>
  );
}

function confirmTitle(confirm: 'rotate' | 'revoke', agent: Agent) {
  return t(confirm === 'rotate' ? 'agents.rotateTitle' : 'agents.revokeTitle', {
    name: agent.name,
  });
}

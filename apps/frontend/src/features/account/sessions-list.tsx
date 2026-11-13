import { useState } from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { FormError } from '@/components/form-error';
import { SectionTitle } from '@/components/section-title';
import { apiError, formatDateTime, t } from '@/i18n';
import { useAccountSessions } from '@/hooks/use-account-sessions';
import type { AccountSession } from './account-model';

const deviceName = (session: AccountSession) =>
  session.browser && session.os
    ? t('account.deviceOn', { browser: session.browser, os: session.os })
    : (session.browser ?? session.os ?? t('account.unknownDevice'));

/** Active sessions of the account. Ending one asks for a second click, like revoking an agent. */
export function SessionsList({ refreshKey }: { refreshKey: number }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const { sessions, error, revoke } = useAccountSessions(refreshKey);

  async function end(url: string, success: string) {
    setConfirming(null);
    const response = await revoke(url);
    if (!response?.ok) {
      toast.error(apiError(await response?.json().catch(() => null), t('account.sessionFailed')));
    } else {
      toast.success(success);
    }
  }
  const confirmOrEnd = (key: string, url: string, success: string) => {
    if (confirming !== key) setConfirming(key);
    else void end(url, success);
  };
  const others = sessions?.filter((session) => !session.current).length ?? 0;
  const confirmButton = (key: string) => confirming === key;

  return (
    <section aria-labelledby="account-sessions" className="flex flex-col gap-4">
      <SectionTitle
        id="account-sessions"
        count={sessions?.length}
        actions={
          others > 0 && (
            <Button
              type="button"
              size="sm"
              variant={confirmButton('others') ? 'destructive' : 'ghost'}
              className={
                confirmButton('others') ? undefined : 'text-destructive hover:text-destructive'
              }
              onClick={() =>
                confirmOrEnd(
                  'others',
                  '/api/account/sessions/revoke-others',
                  t('account.othersEnded'),
                )
              }
              onBlur={() => setConfirming((value) => (value === 'others' ? null : value))}
            >
              {confirmButton('others') ? t('account.confirmEndOthers') : t('account.endOthers')}
            </Button>
          )
        }
      >
        {t('account.sessions')}
      </SectionTitle>
      <FormError>{error}</FormError>
      {sessions && (
        <ItemGroup className="gap-3">
          {sessions.map((session) => {
            const Icon = session.os === 'iPhone' || session.os === 'Android' ? Smartphone : Laptop;
            return (
              <Item key={session.id} variant="outline" className="bg-card">
                <ItemMedia variant="icon">
                  <Icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-label text-base">
                    {deviceName(session)}
                    {session.current && (
                      <Badge variant="success">{t('account.currentSession')}</Badge>
                    )}
                  </ItemTitle>
                  <ItemDescription className="font-mono text-xs">
                    {[
                      session.ipAddress,
                      t('account.started', { time: formatDateTime(session.createdAt) }),
                      t('account.expires', { time: formatDateTime(session.expiresAt) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ItemDescription>
                </ItemContent>
                {!session.current && (
                  <ItemActions>
                    <Button
                      type="button"
                      size="sm"
                      variant={confirmButton(session.id) ? 'destructive' : 'ghost'}
                      className={
                        confirmButton(session.id)
                          ? undefined
                          : 'text-destructive hover:text-destructive'
                      }
                      onClick={() =>
                        confirmOrEnd(
                          session.id,
                          `/api/account/sessions/${encodeURIComponent(session.id)}/revoke`,
                          t('account.sessionEnded'),
                        )
                      }
                      onBlur={() => setConfirming((value) => (value === session.id ? null : value))}
                    >
                      {confirmButton(session.id)
                        ? t('account.confirmEndSession')
                        : t('account.endSession')}
                    </Button>
                  </ItemActions>
                )}
              </Item>
            );
          })}
        </ItemGroup>
      )}
      <p className="text-sm text-muted-foreground">{t('account.sessionsNote')}</p>
    </section>
  );
}

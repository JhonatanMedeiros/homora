import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { initials, type Profile } from './account-model';

/** Who is signed in, with the way to edit it. */
export function IdentityCard({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-14 text-lg">
            <AvatarFallback className="bg-primary/15 font-semibold text-accent-text">
              {initials(profile.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="text-2xl leading-tight font-semibold break-words">{profile.name}</h2>
            <p className="font-mono text-sm break-all text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            {t('account.editProfile')}
          </Button>
          <Badge variant="secondary">{t('account.admin')}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export type Protection = {
  /** Which protection this row describes. */
  id: 'password' | 'twoFactor' | 'passkeys';
  label: string;
  active: boolean;
  /** Status text shown next to the label, so the state never relies on color alone. */
  status: string;
  /** Offered while the protection is off. */
  action?: { label: string; onClick: () => void };
};

/** How much of the account is protected, with the next step in reach. */
export function ProtectionSummary({ items }: { items: Protection[] }) {
  const active = items.filter((item) => item.active).length;
  const level =
    active === items.length
      ? 'strong'
      : active <= 1
        ? 'basic'
        : ('good' as 'strong' | 'basic' | 'good');
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('account.protection')}</h2>
          <Badge variant={level === 'strong' ? 'success' : 'warning'}>
            {t(
              level === 'strong'
                ? 'account.protectionStrong'
                : level === 'good'
                  ? 'account.protectionGood'
                  : 'account.protectionBasic',
            )}
          </Badge>
        </div>
        <div
          role="img"
          aria-label={t('account.protectionMeter', { active, total: items.length })}
          className="flex gap-1.5"
        >
          {items.map((item, index) => (
            <span
              key={item.id}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                index < active ? 'bg-success' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="min-w-0 flex-1 basis-40">{item.label}</span>
              <Badge variant={item.active ? 'success' : 'secondary'}>{item.status}</Badge>
              {!item.active && item.action && (
                <Button
                  type="button"
                  size="sm"
                  className="max-md:basis-full"
                  onClick={item.action.onClick}
                >
                  {item.action.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * One security topic. Cards stack icon, text and button on larger screens and turn into a compact
 * row on phones.
 */
export function SecurityCard({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <Card className="md:h-full">
      <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 md:h-full md:grid-cols-1 md:content-start">
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4.5"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground max-md:text-xs">{description}</p>
        </div>
        <div className="md:mt-auto md:self-start">{action}</div>
      </CardContent>
    </Card>
  );
}

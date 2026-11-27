import { useState } from 'react';
import { Contrast, ExternalLink, LogOut, Sparkles, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@homora/ui/avatar';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@homora/ui/dropdown-menu';
import { initials, type Profile } from '@/features/account/account-model';
import { VersionMenuItem } from '@/components/version-menu-item';
import { useBuildVersion } from '@/hooks/use-build-version';
import { useTheme } from '@/hooks/use-theme';
import { hasUpdate } from '@/features/releases/release-feed';
import { useReleaseFeed } from '@/features/releases/use-release-feed';
import { ReleasesDialog } from '@/features/releases/releases-dialog';
import { t } from '@/i18n';

type Props = {
  profile: Profile | null;
  onAccount: () => void;
  onLogout: () => void;
  /** Where the menu opens from: the bottom of the rail, or the right of the top bar. */
  placement: 'rail' | 'header';
};

/** The person's menu: account, theme, what is new and signing out. */
export function AccountMenu({ profile, onAccount, onLogout, placement }: Props) {
  const [releasesOpen, setReleasesOpen] = useState(false);
  const { toggleTheme } = useTheme();
  const build = useBuildVersion();
  const feed = useReleaseFeed();
  const installedTag = build?.releaseTag ?? null;
  const updateAvailable = !feed.demo && hasUpdate(installedTag, feed.releases);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${t('userMenu.label', { name: profile?.name ?? '' })}${updateAvailable ? ` · ${t('releases.update')}` : ''}`}
            className="relative size-11 rounded-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {profile ? initials(profile.name) : <UserRound className="size-4" />}
              </AvatarFallback>
            </Avatar>
            {updateAvailable && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 size-2 rounded-full bg-primary"
              />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={placement === 'rail' ? 'right' : 'bottom'}
          align="end"
          className="min-w-56"
        >
          {profile && (
            <>
              <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
                <span className="text-sm font-medium text-foreground">{profile.name}</span>
                <span className="text-xs text-muted-foreground">{profile.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={onAccount}>
            <UserRound /> {t('nav.account')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleTheme}>
            <Contrast /> {t('theme.toggle')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setReleasesOpen(true)}>
            <Sparkles /> {t('releases.title')}
            {updateAvailable && <Badge className="ml-auto">{t('releases.update')}</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href="https://github.com/JhonatanMedeiros/homora"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink /> GitHub
            </a>
          </DropdownMenuItem>
          <VersionMenuItem />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onLogout}>
            <LogOut /> {t('app.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReleasesDialog
        open={releasesOpen}
        onOpenChange={setReleasesOpen}
        status={feed.status}
        releases={feed.releases}
        currentTag={installedTag}
        demo={feed.demo}
        retry={feed.retry}
      />
    </>
  );
}

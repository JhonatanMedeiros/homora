import { ExternalLink } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { releaseUrl, useBuildVersion } from '@/hooks/use-build-version';
import { t } from '@/i18n';

export function VersionMenuItem() {
  const build = useBuildVersion();
  if (!build) return null;
  const label = (
    <span className="text-xs text-muted-foreground">
      {t('app.version', { version: build.version })}
    </span>
  );
  if (!build.releaseTag) return <DropdownMenuLabel>{label}</DropdownMenuLabel>;
  return (
    <DropdownMenuItem asChild>
      <a href={releaseUrl(build.releaseTag)} target="_blank" rel="noopener noreferrer">
        <ExternalLink /> {label}
      </a>
    </DropdownMenuItem>
  );
}

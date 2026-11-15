import { releaseUrl, useBuildVersion } from '@/hooks/use-build-version';
import { t } from '@/i18n';

export function VersionFooter() {
  const build = useBuildVersion();
  if (!build) return null;
  const label = t('app.version', { version: build.version });
  return (
    <p className="text-center text-xs text-muted-foreground">
      {build.releaseTag ? (
        <a
          href={releaseUrl(build.releaseTag)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {label}
        </a>
      ) : (
        label
      )}
    </p>
  );
}

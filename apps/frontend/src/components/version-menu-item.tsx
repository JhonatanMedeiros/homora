import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { t } from '@/i18n';

type BuildVersion = { version: string; releaseTag: string | null };

function parseBuildVersion(value: unknown): BuildVersion | null {
  if (!value || typeof value !== 'object') return null;
  const { version, releaseTag } = value as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    return null;
  return { version, releaseTag: releaseTag === `v${version}` ? releaseTag : null };
}

export function VersionMenuItem() {
  const [build, setBuild] = useState<BuildVersion | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // Health also returns a useful build identity when it reports a 503.
    fetch('/api/health', { signal: controller.signal })
      .then((response) => response.json())
      .then((value: unknown) => setBuild(parseBuildVersion(value)))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!build) return null;
  if (!build.releaseTag)
    return <DropdownMenuLabel>{t('app.version', { version: build.version })}</DropdownMenuLabel>;
  return (
    <DropdownMenuItem asChild>
      <a
        href={`https://github.com/JhonatanMedeiros/homora/releases/tag/${build.releaseTag}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink /> {t('app.version', { version: build.version })}
      </a>
    </DropdownMenuItem>
  );
}

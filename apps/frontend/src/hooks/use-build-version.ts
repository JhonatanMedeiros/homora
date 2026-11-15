import { useEffect, useState } from 'react';

type BuildVersion = { version: string; releaseTag: string | null };

function parseBuildVersion(value: unknown): BuildVersion | null {
  if (!value || typeof value !== 'object') return null;
  const { version, releaseTag } = value as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    return null;
  return { version, releaseTag: releaseTag === `v${version}` ? releaseTag : null };
}

export function useBuildVersion() {
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
  return build;
}

export function releaseUrl(tag: string) {
  return `https://github.com/JhonatanMedeiros/homora/releases/tag/${tag}`;
}

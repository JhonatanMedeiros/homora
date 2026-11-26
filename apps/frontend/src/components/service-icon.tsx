import { useState } from 'react';
import { brandIconUrl, iconKind, iconRegistry } from '@/lib/icons';
import { upper } from '@/i18n';
import { cn } from '@homora/ui/lib/utils';

/** Brand marks drawn in near-black, which would vanish on the dark theme. */
const DARK_BRANDS = new Set(
  (
    'authelia cockpit frigate github heimdall jackett matrix mattermost miniflux minio ' +
    'mosquitto ollama paperless-ngx portainer stash tailscale vaultwarden wallabag'
  ).split(' '),
);

/**
 * Service icon: built-in name (`lucide:server`), brand logo (`brand:plex`), image by URL, emoji, or short
 * text. If the name does not exist or the image fails to load, uses the initial of the name.
 */
export function ServiceIcon({ icon, name }: { icon?: string; name: string }) {
  const value = icon ?? '';
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = upper(name.slice(0, 1));
  const kind = iconKind(value);
  if (kind === 'lucide') {
    const Icon = iconRegistry[value.slice('lucide:'.length)];
    if (Icon) return <Icon aria-hidden="true" className="size-5" />;
  }
  if ((kind === 'image' || kind === 'brand') && failedUrl !== value) {
    return (
      <img
        src={kind === 'brand' ? brandIconUrl(value.slice('brand:'.length)) : value}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className={cn(
          'size-6 object-contain',
          kind === 'brand' &&
            DARK_BRANDS.has(value.slice('brand:'.length)) &&
            'dark:rounded-sm dark:bg-white/90 dark:p-0.5',
        )}
        onError={() => setFailedUrl(value)}
      />
    );
  }
  return <>{kind === 'text' ? value : initial}</>;
}

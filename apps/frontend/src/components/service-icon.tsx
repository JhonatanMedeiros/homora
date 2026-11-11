import { useState } from 'react';
import { brandIconUrl, iconKind, iconRegistry } from '@/lib/icons';
import { upper } from '@/i18n';

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
        className="size-6 object-contain"
        onError={() => setFailedUrl(value)}
      />
    );
  }
  return <>{kind === 'text' ? value : initial}</>;
}

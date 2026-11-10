import { useState } from 'react';
import { iconKind, iconRegistry } from '@/lib/icons';
import { upper } from '@/i18n';

/**
 * Ícone de um serviço: nome embutido (`lucide:server`), imagem por URL, emoji ou texto
 * curto. Se o nome não existe ou a imagem não carrega, usa a inicial do nome.
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
  if (kind === 'image' && failedUrl !== value) {
    return (
      <img
        src={value}
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

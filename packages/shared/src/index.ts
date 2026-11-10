import { BRAND_ICON_NAMES } from './brand-icons.js';

export { BRAND_ICON_NAMES };
export type ServiceInput = {
  name: string;
  url: string;
  category: string;
  description: string;
  icon?: string;
  position?: number;
  allowPrivate?: boolean;
};
export type Service = ServiceInput & { id: number };

/** Entrada inválida de serviço; `code` é estável e a mensagem está em inglês. */
export class ServiceValidationError extends Error {
  constructor(readonly code: 'invalid-url' | 'invalid-name-or-category') {
    super(
      code === 'invalid-url'
        ? 'Provide a valid HTTP or HTTPS URL without credentials.'
        : 'Provide a valid name and category.',
    );
    this.name = 'ServiceValidationError';
  }
}

/** Ícones embutidos (`lucide:nome`). A interface registra um componente para cada um. */
export const ICON_NAMES = [
  'server',
  'hard-drive',
  'database',
  'cloud',
  'shield',
  'shield-check',
  'lock',
  'key-round',
  'network',
  'router',
  'wifi',
  'globe',
  'cpu',
  'memory-stick',
  'monitor',
  'tv',
  'laptop',
  'smartphone',
  'tablet',
  'printer',
  'camera',
  'video',
  'film',
  'clapperboard',
  'music',
  'headphones',
  'radio',
  'podcast',
  'book',
  'book-open',
  'library',
  'image',
  'images',
  'gamepad-2',
  'download',
  'upload',
  'folder',
  'file-text',
  'notebook-pen',
  'calendar',
  'clock',
  'mail',
  'message-circle',
  'messages-square',
  'rss',
  'bot',
  'brain-circuit',
  'terminal',
  'code',
  'git-branch',
  'container',
  'boxes',
  'package',
  'activity',
  'chart-line',
  'gauge',
  'thermometer',
  'zap',
  'plug',
  'lightbulb',
  'house',
  'building-2',
  'map-pin',
  'shopping-cart',
  'wallet',
  'receipt-text',
  'credit-card',
  'users',
  'user',
  'settings',
  'wrench',
  'cog',
  'bell',
  'search',
  'star',
  'heart',
  'bookmark',
  'link',
  'qr-code',
  'sliders-horizontal',
  'toggle-left',
  'power',
  'refresh-cw',
  'archive',
  'trash-2',
  'chart-bar',
  'rocket',
  'flame',
  'droplets',
  'sun',
  'moon',
  'cctv',
  'speaker',
  'airplay',
  'cast',
  'tv-minimal',
] as const;

export const ICON_MAX_LENGTH = 512;
const ICON_TEXT_MAX_LENGTH = 8;
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normaliza o ícone de um serviço. Formatos aceitos: texto curto ou emoji (até 8
 * caracteres), `lucide:nome` ou `brand:nome` (ícones embutidos) e URL http(s) de imagem sem credenciais.
 * Qualquer outra coisa vira texto curto, como antes.
 */
export function normalizeIcon(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('lucide:')) {
    const name = raw.slice('lucide:'.length);
    return name.length <= 60 && ICON_NAME.test(name) ? raw : '';
  }
  if (raw.startsWith('brand:')) {
    const name = raw.slice('brand:'.length);
    return (BRAND_ICON_NAMES as readonly string[]).includes(name) ? raw : '';
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!url.username && !url.password && url.href.length <= ICON_MAX_LENGTH) return url.href;
    } catch {
      // Cai no tratamento de texto curto abaixo.
    }
    return '';
  }
  return raw.slice(0, ICON_TEXT_MAX_LENGTH);
}
export function validateService(input: Partial<ServiceInput>): ServiceInput {
  const name = String(input.name ?? '').trim();
  const category = String(input.category ?? '').trim();
  let url: URL;
  try {
    url = new URL(input.url ?? '');
  } catch {
    throw new ServiceValidationError('invalid-url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new ServiceValidationError('invalid-url');
  if (!name || name.length > 80 || !category || category.length > 40)
    throw new ServiceValidationError('invalid-name-or-category');
  return {
    name,
    category,
    url: url.href,
    description: String(input.description ?? '')
      .trim()
      .slice(0, 140),
    icon: normalizeIcon(input.icon),
    position:
      Number.isSafeInteger(input.position) && Number(input.position) >= 0
        ? Number(input.position)
        : 0,
    allowPrivate: input.allowPrivate === true,
  };
}

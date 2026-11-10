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

export const ICON_MAX_LENGTH = 512;
const ICON_TEXT_MAX_LENGTH = 8;
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normaliza o ícone de um serviço. Formatos aceitos: texto curto ou emoji (até 8
 * caracteres), `lucide:nome` (ícone embutido) e URL http(s) de imagem sem credenciais.
 * Qualquer outra coisa vira texto curto, como antes.
 */
export function normalizeIcon(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('lucide:')) {
    const name = raw.slice('lucide:'.length);
    return name.length <= 60 && ICON_NAME.test(name) ? raw : '';
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
    throw new Error('Informe uma URL válida.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use uma URL HTTP ou HTTPS sem credenciais.');
  if (!name || name.length > 80 || !category || category.length > 40)
    throw new Error('Informe nome e categoria válidos.');
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

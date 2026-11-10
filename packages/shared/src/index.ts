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
    icon: String(input.icon ?? '')
      .trim()
      .slice(0, 8),
    position:
      Number.isSafeInteger(input.position) && Number(input.position) >= 0
        ? Number(input.position)
        : 0,
    allowPrivate: input.allowPrivate === true,
  };
}

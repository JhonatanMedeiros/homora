export const en = {
  'data.uptimeKuma':
    'Up: {up} · Down: {down} · Pending: {pending} · Maintenance: {maintenance} · Unknown: {unknown}',
  'connections.slug': 'Public page identifier',
} as const;

export const ptBR: Record<keyof typeof en, string> = {
  'data.uptimeKuma':
    'Ativos: {up} · Indisponíveis: {down} · Pendentes: {pending} · Manutenção: {maintenance} · Desconhecidos: {unknown}',
  'connections.slug': 'Identificador da página pública',
};

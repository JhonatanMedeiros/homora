export const en = {
  'data.healthchecks':
    'Checks: {checks} · Up: {up} · Late: {grace} · Down: {down} · Paused: {paused} · New: {new}',
  'connections.readOnlyApiKey': 'Read-only API key',
  'stat.late': 'Late',
  'stat.paused': 'Paused',
  'stat.new': 'New',
} as const;

export const ptBR: Record<keyof typeof en, string> = {
  'data.healthchecks':
    'Verificações: {checks} · Ativas: {up} · Atrasadas: {grace} · Falhas: {down} · Pausadas: {paused} · Novas: {new}',
  'connections.readOnlyApiKey': 'Chave de API somente leitura',
  'stat.late': 'Atrasadas',
  'stat.paused': 'Pausadas',
  'stat.new': 'Novas',
};

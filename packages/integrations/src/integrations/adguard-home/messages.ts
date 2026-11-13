export const en = {
  'data.adguard': 'Service: {service} · Protection: {protection} · Version: {version}',
  'data.running': 'running',
  'data.stopped': 'stopped',
  'data.enabled': 'enabled',
  'data.disabled': 'disabled',
} as const;

export const ptBR: Record<keyof typeof en, string> = {
  'data.adguard': 'Serviço: {service} · Proteção: {protection} · Versão: {version}',
  'data.running': 'ativo',
  'data.stopped': 'parado',
  'data.enabled': 'ativa',
  'data.disabled': 'desativada',
};

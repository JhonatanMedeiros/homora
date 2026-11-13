export const en = {
  'data.homeAssistant': 'Entity: {entity} · State: {state}',
  'connections.entity': 'Entity',
  'connections.entityPlaceholder': 'sensor.temperature',
} as const;

export const ptBR: Record<keyof typeof en, string> = {
  'data.homeAssistant': 'Entidade: {entity} · Estado: {state}',
  'connections.entity': 'Entidade',
  'connections.entityPlaceholder': 'sensor.temperatura',
};

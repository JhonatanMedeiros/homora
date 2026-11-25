export const en = {
  'pageWidgets.widgetHomeAssistantEntities': 'Home Assistant entities',
  'pageWidgets.widgetHomeAssistantEntitiesDesc': 'States of selected Home Assistant entities',
  'homeAssistantEntities.entities': 'Entity IDs',
  'homeAssistantEntities.entitiesHelp':
    'Enter one entity ID per line, such as sensor.temperature. Add up to 8. Homora requests only these IDs.',
  'homeAssistantEntities.empty': 'No entities selected.',
  'homeAssistantEntities.connectionRequired':
    'Choose a Home Assistant connection to load these entities.',
  'homeAssistantEntities.loading': 'Loading entity states…',
  'homeAssistantEntities.error': 'Could not load Home Assistant entity states.',
  'homeAssistantEntities.stale': 'Showing the last successful reading.',
  'homeAssistantEntities.notFound': 'Not found',
  'homeAssistantEntities.unavailable': 'Unavailable',
  'homeAssistantEntities.updated': 'Updated {time}',
} as const;
export const ptBR: Record<keyof typeof en, string> = {
  'pageWidgets.widgetHomeAssistantEntities': 'Entidades do Home Assistant',
  'pageWidgets.widgetHomeAssistantEntitiesDesc':
    'Estado das entidades selecionadas no Home Assistant',
  'homeAssistantEntities.entities': 'IDs das entidades',
  'homeAssistantEntities.entitiesHelp':
    'Informe um ID por linha, como sensor.temperatura. Adicione até 8. O Homora consulta somente esses IDs.',
  'homeAssistantEntities.empty': 'Nenhuma entidade selecionada.',
  'homeAssistantEntities.connectionRequired':
    'Escolha uma conexão do Home Assistant para carregar estas entidades.',
  'homeAssistantEntities.loading': 'Carregando estados das entidades…',
  'homeAssistantEntities.error':
    'Não foi possível carregar os estados das entidades do Home Assistant.',
  'homeAssistantEntities.stale': 'Exibindo a última leitura bem-sucedida.',
  'homeAssistantEntities.notFound': 'Não encontrada',
  'homeAssistantEntities.unavailable': 'Indisponível',
  'homeAssistantEntities.updated': 'Atualizada {time}',
};

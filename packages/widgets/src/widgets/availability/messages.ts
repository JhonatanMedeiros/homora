export const en = {
  'pageWidgets.widgetAvailability': 'Availability',
  'pageWidgets.widgetAvailabilityDesc':
    'Uptime percentage and check history for a monitored service or probe.',
  'availabilityWidget.target': 'Service or probe',
  'availabilityWidget.targetPlaceholder': 'Select a monitored service or probe',
  'availabilityWidget.targetHelp':
    'Supports service cards and standalone probes. Stored by name for portable exports.',
  'availabilityWidget.targetLoadError': 'Could not load monitored services and probes.',
  'availabilityWidget.targetNotInList':
    'This target is no longer in the current list (missing or renamed).',
  'availabilityWidget.range': 'Period',
  'availabilityWidget.range.24h': '24 hours',
  'availabilityWidget.range.7d': '7 days',
  'availabilityWidget.range.30d': '30 days',
  'availabilityWidget.kind.service': 'Service',
  'availabilityWidget.kind.probe': 'Probe',
  'availabilityWidget.unconfigured': 'Select a monitored service or probe to view availability.',
  'availabilityWidget.loading': 'Loading availability',
  'availabilityWidget.error': 'Could not load availability.',
  'availabilityWidget.missingTarget': 'Target "{name}" was not found.',
  'availabilityWidget.missingTargetHint':
    'It may have been deleted or renamed. Edit this widget to choose another target.',
  'availabilityWidget.stale': 'Showing outdated data ({time})',
  'availabilityWidget.staleCheck': 'Last check {time}',
  'availabilityWidget.now': 'just now',
  'availabilityWidget.insufficientData': 'Insufficient data',
  'availabilityWidget.insufficientDataDetail': '{counted} of {min} checks needed for availability',
  'availabilityWidget.checksSummary': '{up} up · {down} down',
  'availabilityWidget.excludedChecks': '{count} maintenance/unknown excluded',
  'availabilityWidget.reconfigured': 'Checks before the latest config change are excluded.',
  'availabilityWidget.openService': 'Open {name} details',
  'availabilityWidget.openProbe': 'Open probes for {name}',
  'availabilityWidget.barLabel': '{name} availability over {range}: {pct}, {up} up, {down} down',
  'availabilityWidget.state.ok': 'Up',
  'availabilityWidget.state.down': 'Down',
  'availabilityWidget.state.degraded': 'Degraded',
  'availabilityWidget.state.maintenance': 'Maintenance',
  'availabilityWidget.state.blocked': 'Blocked',
  'availabilityWidget.state.unknown': 'Unknown',
} as const;

export const ptBR: Record<keyof typeof en, string> = {
  'pageWidgets.widgetAvailability': 'Disponibilidade',
  'pageWidgets.widgetAvailabilityDesc':
    'Percentual de disponibilidade e histórico de verificações de um serviço ou sonda.',
  'availabilityWidget.target': 'Serviço ou sonda',
  'availabilityWidget.targetPlaceholder': 'Selecione um serviço ou sonda monitorado',
  'availabilityWidget.targetHelp':
    'Suporta cartões de serviço e sondas avulsas. Salvo pelo nome para exportações portáteis.',
  'availabilityWidget.targetLoadError': 'Não foi possível carregar serviços e sondas monitorados.',
  'availabilityWidget.targetNotInList':
    'Este alvo não está mais na lista atual (removido ou renomeado).',
  'availabilityWidget.range': 'Período',
  'availabilityWidget.range.24h': '24 horas',
  'availabilityWidget.range.7d': '7 dias',
  'availabilityWidget.range.30d': '30 dias',
  'availabilityWidget.kind.service': 'Serviço',
  'availabilityWidget.kind.probe': 'Sonda',
  'availabilityWidget.unconfigured':
    'Selecione um serviço ou sonda monitorado para ver a disponibilidade.',
  'availabilityWidget.loading': 'Carregando disponibilidade',
  'availabilityWidget.error': 'Não foi possível carregar a disponibilidade.',
  'availabilityWidget.missingTarget': 'O alvo "{name}" não foi encontrado.',
  'availabilityWidget.missingTargetHint':
    'Ele pode ter sido removido ou renomeado. Edite este widget para escolher outro alvo.',
  'availabilityWidget.stale': 'Exibindo dados desatualizados ({time})',
  'availabilityWidget.staleCheck': 'Última verificação {time}',
  'availabilityWidget.now': 'agora mesmo',
  'availabilityWidget.insufficientData': 'Dados insuficientes',
  'availabilityWidget.insufficientDataDetail':
    '{counted} de {min} verificações necessárias para calcular',
  'availabilityWidget.checksSummary': '{up} ok · {down} falhas',
  'availabilityWidget.excludedChecks': '{count} em manutenção/desconhecidas fora da contagem',
  'availabilityWidget.reconfigured':
    'Verificações anteriores à última mudança de configuração são excluídas.',
  'availabilityWidget.openService': 'Abrir detalhes de {name}',
  'availabilityWidget.openProbe': 'Abrir sondas para {name}',
  'availabilityWidget.barLabel':
    'Disponibilidade de {name} em {range}: {pct}, {up} ok, {down} falhas',
  'availabilityWidget.state.ok': 'No ar',
  'availabilityWidget.state.down': 'Fora do ar',
  'availabilityWidget.state.degraded': 'Degradado',
  'availabilityWidget.state.maintenance': 'Manutenção',
  'availabilityWidget.state.blocked': 'Bloqueado',
  'availabilityWidget.state.unknown': 'Desconhecido',
};

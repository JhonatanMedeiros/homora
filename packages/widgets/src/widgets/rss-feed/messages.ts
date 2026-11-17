export const en = {
  'pageWidgets.widgetRssFeed': 'RSS / Atom feed',
  'pageWidgets.widgetRssFeedDesc': 'Follow recent entries from an RSS or Atom feed',
  'rssWidget.feedUrl': 'Feed URL',
  'rssWidget.feedUrlPlaceholder': 'https://example.com/feed.xml',
  'rssWidget.feedUrlHint':
    'HTTPS and public addresses are required unless private network access is enabled.',
  'rssWidget.title': 'Display title (optional)',
  'rssWidget.titlePlaceholder': 'Leave empty to use the feed title',
  'rssWidget.limit': 'Entries',
  'rssWidget.allowPrivateNetwork': 'Allow HTTP and private/LAN network addresses',
  'rssWidget.allowPrivateNetworkHint':
    'Enable only for trusted feeds on your local network. Redirects and URL credentials remain blocked.',
  'rssWidget.unconfigured': 'Enter a feed URL to display recent entries.',
  'rssWidget.loading': 'Loading feed…',
  'rssWidget.empty': 'No entries found in this feed.',
  'rssWidget.error': 'Could not load this feed.',
  'rssWidget.policyBlocked':
    'Blocked by network policy. Enable private network access in widget settings if this feed uses HTTP or a private address.',
  'rssWidget.stale': 'Showing cached entries; refresh failed.',
  'rssWidget.openEntry': 'Open entry in new tab: {title}',
  'rssWidget.noDate': 'Undated',
} as const;

export const ptBR: Record<keyof typeof en, string> = {
  'pageWidgets.widgetRssFeed': 'Feed RSS / Atom',
  'pageWidgets.widgetRssFeedDesc': 'Acompanhe entradas recentes de um feed RSS ou Atom',
  'rssWidget.feedUrl': 'URL do feed',
  'rssWidget.feedUrlPlaceholder': 'https://exemplo.com/feed.xml',
  'rssWidget.feedUrlHint':
    'HTTPS e endereços públicos são obrigatórios, a menos que o acesso à rede privada esteja habilitado.',
  'rssWidget.title': 'Título de exibição (opcional)',
  'rssWidget.titlePlaceholder': 'Deixe vazio para usar o título do feed',
  'rssWidget.limit': 'Entradas',
  'rssWidget.allowPrivateNetwork': 'Permitir HTTP e endereços de rede privada/LAN',
  'rssWidget.allowPrivateNetworkHint':
    'Ative apenas para feeds confiáveis na sua rede local. Redirecionamentos e credenciais na URL continuam bloqueados.',
  'rssWidget.unconfigured': 'Informe uma URL de feed para exibir as entradas recentes.',
  'rssWidget.loading': 'Carregando feed…',
  'rssWidget.empty': 'Nenhuma entrada encontrada neste feed.',
  'rssWidget.error': 'Não foi possível carregar este feed.',
  'rssWidget.policyBlocked':
    'Bloqueado pela política de rede. Ative o acesso à rede privada nas configurações do widget se este feed usar HTTP ou um endereço privado.',
  'rssWidget.stale': 'Exibindo entradas em cache; a atualização falhou.',
  'rssWidget.openEntry': 'Abrir entrada em nova aba: {title}',
  'rssWidget.noDate': 'Sem data',
};

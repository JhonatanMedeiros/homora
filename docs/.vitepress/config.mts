import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Homora',
  locales: {
    root: { label: 'English', lang: 'en-US' },
    'pt-BR': {
      label: 'Português (Brasil)',
      lang: 'pt-BR',
      description: 'Documentação do painel self-hosted para homelab.',
      themeConfig: {
        nav: [
          { text: 'Guia', link: '/pt-BR/user-guide/getting-started' },
          { text: 'Integrações', link: '/pt-BR/user-guide/integrations-and-widgets' },
          { text: 'Contribuir', link: '/pt-BR/contributing' },
        ],
        sidebar: [
          {
            text: 'Primeiros passos',
            items: [
              { text: 'Introdução', link: '/pt-BR/' },
              { text: 'Comece por aqui', link: '/pt-BR/user-guide/getting-started' },
              { text: 'Casos de uso', link: '/pt-BR/user-guide/use-cases' },
              { text: 'Visão geral do guia', link: '/pt-BR/user-guide/README' },
            ],
          },
          {
            text: 'Usando o Homora',
            items: [
              { text: 'Dashboard', link: '/pt-BR/user-guide/dashboard' },
              {
                text: 'Serviços e monitoramento',
                link: '/pt-BR/user-guide/services-and-monitoring',
              },
              {
                text: 'Alertas e página de status',
                link: '/pt-BR/user-guide/notifications-and-status-page',
              },
              { text: 'Integrações e widgets', link: '/pt-BR/user-guide/integrations-and-widgets' },
              { text: 'Descoberta Docker', link: '/pt-BR/user-guide/docker-discovery' },
              { text: 'Agentes de IA e MCP', link: '/pt-BR/user-guide/agents-and-mcp' },
              { text: 'Aparência', link: '/pt-BR/user-guide/appearance' },
            ],
          },
          {
            text: 'Administrando o Homora',
            items: [
              { text: 'Instalação e atualizações', link: '/pt-BR/user-guide/deployment' },
              {
                text: 'Importação, exportação e backup',
                link: '/pt-BR/user-guide/import-export-backup',
              },
              { text: 'Conta e segurança', link: '/pt-BR/user-guide/accounts-and-security' },
              { text: 'Logs e verificação de saúde', link: '/pt-BR/user-guide/logs' },
            ],
          },
          {
            text: 'Referências em inglês',
            collapsed: true,
            items: [
              { text: 'Integrações', link: '/integrations' },
              { text: 'Capacidades dos agentes', link: '/agent-capabilities' },
              { text: 'Arquitetura e segurança', link: '/architecture' },
              { text: 'Plano de evolução', link: '/evolution' },
              { text: 'Padrões de engenharia', link: '/standards' },
              { text: 'Criar uma integração', link: '/adapters' },
            ],
          },
        ],
        outline: { label: 'Nesta página' },
        docFooter: { prev: 'Página anterior', next: 'Próxima página' },
        sidebarMenuLabel: 'Menu',
        langMenuLabel: 'Alterar idioma',
        skipToContentLabel: 'Ir para o conteúdo',
        darkModeSwitchLabel: 'Aparência',
        returnToTopLabel: 'Voltar ao topo',
        editLink: {
          pattern: 'https://github.com/JhonatanMedeiros/homora/edit/main/docs/:path',
          text: 'Edite esta página no GitHub',
        },
        footer: { message: 'Distribuído sob a licença MIT.' },
      },
    },
  },
  description: 'Documentation for the self-hosted homelab dashboard.',
  head: [['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }]],
  appearance: 'dark',
  // These are instructions for the reader's own machine, not pages in this site.
  ignoreDeadLinks: [/^https?:\/\/localhost(?::\d+)?\/?$/],
  markdown: {
    config(md) {
      // GitHub renders repository-relative links; the site cannot serve files above docs/.
      const repositoryLinks: Record<string, string> = {
        '../AGENTS.md': 'AGENTS.md',
        '../../README.md': 'README.md',
        '../../GLOSSARY.md': 'GLOSSARY.md',
        '../../SECURITY.md': 'SECURITY.md',
        '../decisions': 'docs/decisions',
      };
      md.core.ruler.push('repository-links', (state) => {
        for (const block of state.tokens) {
          for (const token of block.children ?? []) {
            if (token.type !== 'link_open') continue;
            const href = token.attrGet('href');
            if (href && repositoryLinks[href]) {
              token.attrSet(
                'href',
                `https://github.com/JhonatanMedeiros/homora/${href === '../decisions' ? 'tree' : 'blob'}/main/${repositoryLinks[href]}`,
              );
            }
          }
        }
      });
    },
  },
  themeConfig: {
    i18nRouting: false,
    logo: '/logo.svg',
    siteTitle: 'Homora Docs',
    nav: [
      { text: 'Guide', link: '/user-guide/getting-started' },
      { text: 'Integrations', link: '/integrations' },
      { text: 'Contribute', link: '/contributing' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/JhonatanMedeiros/homora' }],
    search: {
      provider: 'local',
      options: {
        locales: {
          'pt-BR': {
            translations: {
              button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
              modal: {
                noResultsText: 'Nenhum resultado para',
                resetButtonTitle: 'Limpar busca',
                footer: { selectText: 'selecionar', navigateText: 'navegar', closeText: 'fechar' },
              },
            },
          },
        },
      },
    },
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Your first steps', link: '/user-guide/getting-started' },
          { text: 'Common use cases', link: '/user-guide/use-cases' },
          { text: 'User guide overview', link: '/user-guide/README' },
        ],
      },
      {
        text: 'Using Homora',
        items: [
          { text: 'Dashboard', link: '/user-guide/dashboard' },
          { text: 'Services and monitoring', link: '/user-guide/services-and-monitoring' },
          { text: 'Alerts and status page', link: '/user-guide/notifications-and-status-page' },
          { text: 'Integrations and widgets', link: '/user-guide/integrations-and-widgets' },
          { text: 'Docker discovery', link: '/user-guide/docker-discovery' },
          { text: 'AI agents and MCP', link: '/user-guide/agents-and-mcp' },
          { text: 'Appearance', link: '/user-guide/appearance' },
        ],
      },
      {
        text: 'Running Homora',
        items: [
          { text: 'Deployment and upgrades', link: '/user-guide/deployment' },
          { text: 'Import, export and backup', link: '/user-guide/import-export-backup' },
          { text: 'Accounts and security', link: '/user-guide/accounts-and-security' },
          { text: 'Runtime logs', link: '/user-guide/logs' },
        ],
      },
      {
        text: 'Reference',
        collapsed: true,
        items: [
          { text: 'Integrations', link: '/integrations' },
          { text: 'Integration catalog', link: '/integration-catalog' },
          { text: 'Widget catalog', link: '/widget-catalog' },
          { text: 'Agent capabilities', link: '/agent-capabilities' },
          { text: 'Agent walkthrough', link: '/agent-demo' },
          { text: 'Architecture and security', link: '/architecture' },
          { text: 'Product vision', link: '/product' },
          { text: 'Evolution plan', link: '/evolution' },
        ],
      },
      {
        text: 'Contributing',
        collapsed: true,
        items: [
          { text: 'Contributing to Homora', link: '/contributing' },
          { text: 'Engineering standards', link: '/standards' },
          { text: 'Building an integration', link: '/adapters' },
          { text: 'Maintaining releases', link: '/maintainers/releases' },
          { text: 'Maintaining this site', link: '/maintainers/documentation' },
        ],
      },
    ],
    editLink: {
      pattern: 'https://github.com/JhonatanMedeiros/homora/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: { message: 'Released under the MIT License.' },
  },
});

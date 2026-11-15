---
layout: home
title: Homora
titleTemplate: Documentação

hero:
  name: Homora
  text: Um lar para seu homelab.
  tagline: Um painel self-hosted para organizar seus serviços e acompanhar a saúde deles. Proxmox e agentes de IA são opcionais.
  actions:
    - theme: brand
      text: Primeiros passos
      link: /pt-BR/user-guide/getting-started
    - theme: alt
      text: Ver o guia
      link: /pt-BR/user-guide/README

features:
  - icon: { src: /icons/layout.svg }
    title: Organize
    details: Páginas, grupos e cartões para cada serviço, com ícones de marca e paleta de comandos.
    link: /pt-BR/user-guide/dashboard
    linkText: O dashboard
  - icon: { src: /icons/activity.svg }
    title: Monitore
    details: Sete tipos de verificação, incidentes, disponibilidade e alertas no Telegram, ntfy, Discord ou webhooks.
    link: /pt-BR/user-guide/services-and-monitoring
    linkText: Serviços e monitoramento
  - icon: { src: /icons/plug.svg }
    title: Integre
    details: Mostre dados ao vivo das suas ferramentas com integrações e widgets.
    link: /pt-BR/user-guide/integrations-and-widgets
    linkText: Integrações e widgets
  - icon: { src: /icons/container.svg }
    title: Descubra
    details: Adicione contêineres Docker a partir de labels, localmente ou por agentes remotos.
    link: /pt-BR/user-guide/docker-discovery
    linkText: Descoberta Docker
  - icon: { src: /icons/bot.svg }
    title: Delegue
    details: Deixe um agente de IA propor mudanças com tokens limitados. Você revisa cada proposta.
    link: /pt-BR/user-guide/agents-and-mcp
    linkText: Agentes de IA e MCP
  - icon: { src: /icons/shield.svg }
    title: Mantenha o controle
    details: Verificação em duas etapas, passkeys, backups e página de status pública somente leitura.
    link: /pt-BR/user-guide/accounts-and-security
    linkText: Conta e segurança
---

<section class="home-section">

## Funcionando em dois minutos

```bash
git clone https://github.com/JhonatanMedeiros/homora.git
cd homora
docker compose up -d --build
```

Depois acesse <http://localhost:8080> e crie a conta administradora. [Veja o passo a passo](user-guide/getting-started.md).

</section>

<section class="home-section">

## Veja em ação

As imagens usam dados fictícios de uma instalação de demonstração.

<div class="home-gallery">
<figure>

![Detalhes de um serviço com disponibilidade e incidentes](../screenshots/service-detail.png)

<figcaption>Investigue saúde e incidentes. <a href="/pt-BR/user-guide/services-and-monitoring.html">Monitoramento</a></figcaption>
</figure>
<figure>

![Página de integrações do Homora](../screenshots/integrations.png)

<figcaption>Traga suas ferramentas para o Homora. <a href="/pt-BR/user-guide/integrations-and-widgets.html">Integrações</a></figcaption>
</figure>
</div>

</section>

<section class="home-section">

## Encontre seu caminho

<div class="home-paths">

[**Primeira vez** Instale o Homora e adicione um serviço.](user-guide/getting-started.md)

[**Já tenho configuração** Importe e faça backup.](user-guide/import-export-backup.md)

[**Acesso para outras pessoas** Use HTTPS e proteja as contas.](user-guide/deployment.md)

[**Contribuir** Prepare o projeto e crie uma integração.](contributing.md)

</div>

O Homora está em desenvolvimento inicial e foi pensado para acesso local. Os guias indicam recursos experimentais.

</section>

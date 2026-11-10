# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Entusiastas de self-hosting e homelab, em projeto open source: pessoas que mantêm
serviços próprios e querem reuni-los num só lugar. Usam o Homora todos os dias
para abrir serviços e ver se estão no ar, e de vez em quando para organizar,
conectar integrações ou revisar propostas de um agente. Não se pressupõe
conhecimento prévio do produto; o primeiro uso precisa funcionar sem manual.
Acesso local, uma conta de administrador.

## Product Purpose

Reunir serviços e informações do ambiente num painel personalizável, útil sem
Proxmox e sem agentes de IA. Sucesso: cadastrar o primeiro serviço rapidamente,
abrir qualquer serviço em um clique e saber se ele está disponível.

## Positioning

Homepage self-hosted em que um agente de IA só altera a configuração por meio de
propostas que a pessoa revisa e aprova, com permissões explícitas e registro das
ações.

## Operating Context

Navegador no desktop e no celular, rede local (HTTP em loopback). Integrações
atuais: Proxmox somente leitura e conexões de leitura experimentais. O MCP é um
processo local de leitura.

## Capabilities and Constraints

- Grupos e cards de serviço (nome, URL, ícone, descrição), busca, ordenação.
- Estado de disponibilidade: disponível, indisponível ou desconhecido, com
  horário da última tentativa.
- Propostas de agentes aprovadas ou rejeitadas na interface; credenciais nunca
  aparecem no navegador.
- Interface em português do Brasil, utilizável com teclado e em telas pequenas.
- Fora do MVP: reiniciar VMs, múltiplos usuários, app nativo, plugins.

## Brand Commitments

Nome: Homora. Tom pedido pelo mantenedor: caloroso e pessoal, em vez de painel
administrativo frio. Tema claro e escuro existentes devem continuar.

## Evidence on Hand

Docs em `docs/`. Não há depoimentos, clientes nem
métricas; não inventar.

## Product Principles

1. Usar vem antes de administrar: abrir serviços é o caminho principal.
2. Estado honesto: desconhecido é mostrado como desconhecido.
3. Humano no controle: nada de agente altera a configuração sem aprovação.
4. Funciona sozinho: sem Proxmox, sem agente, sem manual.

## Accessibility & Inclusion

Navegação completa por teclado, foco visível, alvos de toque de 44px, contraste
mínimo AA, respeito a `prefers-reduced-motion`, estado nunca só por cor.

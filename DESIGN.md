---
name: Homora
description: Homepage self-hosted para abrir serviços da casa e acompanhar o homelab, com visual quente e calmo.
colors:
  honey: 'oklch(0.8 0.13 70)'
  honey-ink: 'oklch(0.5 0.12 55)'
  ember-night: 'oklch(0.17 0.012 55)'
  kitchen-panel: 'oklch(0.215 0.014 55)'
  cream-paper: 'oklch(0.965 0.014 85)'
  paper-panel: 'oklch(0.99 0.008 85)'
  ok: 'oklch(0.78 0.14 150)'
  bad: 'oklch(0.73 0.16 25)'
  none: 'oklch(0.6 0.015 70)'
typography:
  display:
    fontFamily: 'Bricolage Grotesque, system-ui, sans-serif'
    fontSize: '2.125rem'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '-0.03em'
  headline:
    fontFamily: 'Bricolage Grotesque, system-ui, sans-serif'
    fontSize: '1.1875rem'
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: '-0.02em'
  title:
    fontFamily: 'Hanken Grotesk, system-ui, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: 'Hanken Grotesk, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: 'Hanken Grotesk, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.45
  hint:
    fontFamily: 'Hanken Grotesk, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: 'Hanken Grotesk, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1.4
rounded:
  xs: '4px'
  sm: '6px'
  md: '10px'
  card: '12px'
  lg: '14px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.honey}'
    textColor: '{colors.ember-night}'
    rounded: '{rounded.md}'
    height: '44px'
    padding: '0 16px'
  button-secondary:
    backgroundColor: '{colors.kitchen-panel}'
    textColor: '{colors.cream-paper}'
    rounded: '{rounded.md}'
    height: '44px'
    padding: '0 16px'
  service-card:
    backgroundColor: '{colors.kitchen-panel}'
    rounded: '{rounded.lg}'
    padding: '16px'
---

# Design System: Homora

## Overview

**Creative North Star: "A Cozinha da Casa"**

Homora é o lugar da casa onde tudo fica à mão: quente, de uso diário, sem cerimônia. O visual vem de neutros com um fundo levemente acastanhado (grafite quente à noite, papel creme de manhã) e de um único acento âmbar, cor de mel. Nada grita; o que importa é abrir o serviço certo em um clique e saber, de relance, se ele está no ar.

A interface separa dois modos: **usar** (cards, busca e estado) e **organizar** (criar grupos, renomear, reordenar), que fica atrás do botão "Organizar". Densidade média, cantos suaves, bordas finas, nenhuma sombra. A personalidade vem da cor, da fonte Bricolage nos títulos e do tom de voz em português, próximo e direto.

Rejeita o **painel corporativo frio**: azul e cinza genéricos, tabelas densas e todos os elementos com o mesmo peso.

**Key Characteristics:**

- Neutros quentes e um único acento âmbar.
- Verde, vermelho e cinza significam só estado, e sempre com texto e forma.
- Bordas finas no lugar de sombras; cantos de 10 a 14 px.
- Títulos em Bricolage Grotesque, texto em Hanken Grotesk.
- Claro e escuro seguem o sistema, com alternância manual.

## Colors

Paleta de neutros quentes com um acento único; as cores de estado ficam fora da identidade.

### Primary

- **Mel** (`oklch(0.8 0.13 70)` no escuro, `oklch(0.5 0.12 55)` no claro): botão primário, item de navegação ativo, anel de foco, ícones de card, barras de uso. É o único acento.

### Neutral

- **Noite de Cozinha** (`oklch(0.17 0.012 55)`): fundo no tema escuro.
- **Painel Escuro** (`oklch(0.215 0.014 55)` e `oklch(0.265 0.017 55)`): topo, cartões e superfícies elevadas.
- **Papel Creme** (`oklch(0.965 0.014 85)`): fundo no tema claro.
- **Painel Claro** (`oklch(0.99 0.008 85)` e `oklch(0.94 0.02 82)`): cartões e superfícies.
- **Texto** (`oklch(0.95 0.012 85)` escuro, `oklch(0.25 0.03 55)` claro) e **apagado** (`oklch(0.75 0.02 75)` escuro, `oklch(0.47 0.03 60)` claro): texto principal e secundário, ambos acima de 4.5:1.

### Estado

- **No ar** `--ok`, **fora do ar** `--bad`, **sem informação** `--none`. Nunca decoram: só aparecem no indicador de disponibilidade, em etiquetas de estado e em erros.

### Named Rules

**The One Honey Rule.** O âmbar ocupa no máximo 10% de qualquer tela. Sua raridade é o que marca a ação principal.

**The Never Color Alone Rule.** Estado nunca é só cor: círculo cheio (no ar), triângulo (fora do ar), anel vazio (sem informação), sempre com rótulo em texto.

## Typography

**Display Font:** Bricolage Grotesque (com system-ui)
**Body Font:** Hanken Grotesk (com system-ui)

**Character:** Bricolage dá calor e um pouco de personalidade nos títulos; Hanken mantém o texto neutro e legível. Ambas são servidas localmente (SIL OFL 1.1, ver `apps/frontend/src/fonts/README.md`). Números tabulares em toda a interface.

### Hierarchy

- **Display** (700, 1.75rem no celular e 2.125rem no tablet em diante, 1.12, -0.03em): título de cada página (`h1`).
- **Headline** (650, 1.1875rem, 1.25, -0.02em): títulos de grupo e de seção (`h2`).
- **Title** (650, 1.0625rem; 1rem em `h3`): nome do serviço no card, subtítulos.
- **Body** (400, 1rem, 1.5): texto corrido; descrições limitadas a 58 a 62 caracteres por linha.
- **Body small** (400, 0.9375rem, 1.45): descrição do card, texto de botões, campos e mensagens.
- **Hint** (400, 0.875rem): dicas, textos de apoio e legendas de formulário.
- **Mono** (400, 0.8125rem a 0.875rem): endereços e tokens.
- **Label** (600, 0.8125rem): estado, etiquetas, contadores e dicas. Nada abaixo de 0.8125rem.

### Named Rules

**The Two Voices Rule.** Bricolage só em títulos e marca; tudo o mais é Hanken. A monoespaçada do sistema (`ui-monospace`, SF Mono, Menlo, Consolas) só em endereços e tokens.

## Layout

Começa pelo celular e se expande. Contêiner de até 1180 px com margens de 16 px (24 px a partir de 640 px). Painéis aparecem um por vez (Serviços, Integrações, Agentes). Abaixo de 980 px a navegação é uma barra inferior de 64 px com ícones e rótulos; a partir de 980 px vira abas no topo.

Os cards formam uma grade de 1 coluna (celular), 2 (a partir de 640 px) e 3 (a partir de 980 px), com 12 px entre eles. Grupos têm 32 px de separação, e o título do grupo sempre tem espaço maior acima do que abaixo. Todos os alvos de toque têm 44 px (40 px no desktop com mouse).

## Elevation & Depth

Plano por padrão: **sem sombras**. A profundidade vem da camada tonal (fundo, painel, painel elevado) e de uma borda de 1 px. No hover ou foco, o card troca a cor da borda para uma mistura com o âmbar e ganha um leve tom de fundo.

### Named Rules

**The Border Only Rule.** A elevação se declara uma vez, com borda. Sem sombra sob borda, sem blur decorativo no topo ou na navegação inferior.

## Shapes

Cantos suaves e consistentes: 4 px (marcas e barras pequenas), 6 px (foco), 10 px (botões, campos, chips), 12 px (blocos internos, listas de conexão e áreas de aviso), 14 px (cartões e painéis), pílula só para etiquetas e contadores pequenos. Bordas de 1 px; no modo Organizar, os cards passam a ter borda tracejada.

## Components

### Buttons

- **Shape:** 10 px de raio, 44 px de altura (40 px no desktop; `.small` 40 e 36 px).
- **Primary:** fundo mel, texto escuro, um por tela ("Adicionar serviço", "Aprovar e aplicar").
- **Secondary:** fundo de painel elevado com borda; **quiet** sem fundo; **danger** com texto na cor de erro.
- **Hover / Focus:** a borda escurece; o primário clareia levemente. Foco: anel de 2 px em mel com 2 px de afastamento.
- **Pressed:** o botão "Organizar" usa `aria-pressed` com fundo mel a 16%.

### Chips

- **Style:** sem fundo no repouso, texto apagado, contagem ao lado.
- **State:** selecionado ganha fundo de painel elevado e borda; só aparecem com mais de um grupo.

### Cards / Containers

- **Corner Style:** 14 px.
- **Background:** painel; hover mistura 5% de mel.
- **Shadow Strategy:** nenhuma (ver Elevation).
- **Border:** 1 px de linha; tracejada no modo Organizar.
- **Internal Padding:** 16 px (20 px em cartões de integração e formulários).

### Inputs / Fields

- **Style:** 46 px de altura, borda de linha, fundo da página, raio de 10 px.
- **Focus:** borda em mel e halo de 3 px a 28% de mel.
- **Error:** texto na cor de erro abaixo do campo, em `role="alert"`.

### Navigation

- Topo (desktop): itens de texto com 40 px de altura; ativo com fundo de mel a 14% e texto em mel. Celular: barra inferior com ícone e rótulo; ativo com texto mel e marca de 3 px no topo.

### Service Card (componente central)

Ícone de 44 px (emoji do usuário ou inicial), nome com link que cobre o cartão inteiro, endereço em monoespaçada, descrição em até 2 linhas e indicador de disponibilidade. As ações ficam atrás de "⋯" (Editar e Remover); no modo Organizar, o "⋯" dá lugar a alça e botões de mover.

### Organize Bar

Faixa de borda tracejada em mel, com texto explicando o modo e o formulário de novo grupo. Aparece só em "Organizar" e substitui os filtros.

### Proposal Card

Proposta pendente tem borda mel e fundo com 6% de mel; as já decididas ficam num histórico recolhido. Alterações mostram "Antes" (riscado, apagado) e "Depois" por campo.

### Token Box

Caixa com borda mel que exibe um token uma única vez, com botão de copiar e "Já guardei".

## Do's and Don'ts

### Do:

- **Do** manter o mel em no máximo 10% da tela e em ações principais, foco e estado ativo.
- **Do** mostrar estado com cor, forma e texto juntos.
- **Do** usar borda de 1 px como única declaração de elevação.
- **Do** pedir confirmação de remoção no próprio botão, nunca com diálogo nativo.
- **Do** deixar "usar" na frente e esconder a gestão atrás de "Organizar".
- **Do** escrever em português claro e próximo; descrever permissões do agente em frases.
- **Do** respeitar `prefers-reduced-motion` e manter alvos de toque de 44 px.

### Don't:

- **Don't** criar um visual de painel corporativo frio: azul e cinza genéricos, tabelas densas, tudo com o mesmo peso.
- **Don't** usar sombra, blur ou vidro como decoração.
- **Don't** colocar rótulos pequenos em maiúsculas acima de títulos.
- **Don't** usar cor de estado (verde, vermelho) como decoração.
- **Don't** usar glifos de texto como ícones; os ícones são SVG em traço de 1.75 px.
- **Don't** aninhar cartões dentro de cartões.

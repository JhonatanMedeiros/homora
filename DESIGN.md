---
name: Homora
description: Painel self-hosted de homelab em que tudo é rotulado como num patch panel, grafite aquecido com fita laminada de rotuladora.
colors:
  tape-yellow: 'oklch(0.87 0.17 95)'
  tape-yellow-dark: 'oklch(0.88 0.17 95)'
  tape-yellow-ink: 'oklch(0.2 0.02 80)'
  warm-paper: 'oklch(0.965 0.008 85)'
  paper-card: 'oklch(0.99 0.004 85)'
  paper-muted: 'oklch(0.94 0.008 85)'
  paper-secondary: 'oklch(0.925 0.01 85)'
  paper-accent: 'oklch(0.92 0.02 90)'
  graphite-ink: 'oklch(0.22 0.012 70)'
  graphite-muted-ink: 'oklch(0.47 0.015 75)'
  paper-border: 'oklch(0.87 0.01 85)'
  paper-input-border: 'oklch(0.72 0.012 80)'
  focus-graphite: 'oklch(0.38 0.02 70)'
  laminated-tape: 'oklch(1 0 0)'
  tape-ink: 'oklch(0.17 0.01 70)'
  rack-rail: 'oklch(0.235 0.01 70)'
  rack-rail-dark: 'oklch(0.165 0.008 70)'
  rack-rail-ink: 'oklch(0.94 0.01 85)'
  rack-rail-hover: 'oklch(0.3 0.012 70)'
  rack-rail-border: 'oklch(0.32 0.012 70)'
  night-graphite: 'oklch(0.2 0.008 70)'
  night-card: 'oklch(0.245 0.009 70)'
  night-popover: 'oklch(0.27 0.01 70)'
  night-ink: 'oklch(0.95 0.01 90)'
  night-muted: 'oklch(0.28 0.01 70)'
  night-muted-ink: 'oklch(0.72 0.014 80)'
  night-border: 'oklch(0.34 0.01 70)'
  night-input-border: 'oklch(0.5 0.012 70)'
  night-tape: 'oklch(0.95 0.008 95)'
  status-ok: 'oklch(0.45 0.13 150)'
  status-ok-night: 'oklch(0.78 0.15 150)'
  status-down: 'oklch(0.52 0.19 27)'
  status-down-night: 'oklch(0.7 0.18 27)'
  status-on-color: 'oklch(0.985 0.005 85)'
typography:
  headline:
    fontFamily: "'Barlow Semi Condensed', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '1.875rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  title:
    fontFamily: "'Barlow Semi Condensed', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: '-0.025em'
  body:
    fontFamily: "'Figtree Variable', system-ui, sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  body-compact:
    fontFamily: "'Figtree Variable', system-ui, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.43
  label-tape:
    fontFamily: "'Barlow Semi Condensed', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '0.08em'
  data:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.4
rounded:
  tape: '3px'
  sm: '6px'
  md: '8px'
  lg: '10px'
  xl: '14px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '32px'
  rail-width: '232px'
  header-height: '64px'
  content-max: '72rem'
components:
  button-primary:
    backgroundColor: '{colors.tape-yellow}'
    textColor: '{colors.tape-yellow-ink}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
    height: '40px'
  button-outline:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.graphite-ink}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
    height: '40px'
  button-ghost-hover:
    backgroundColor: '{colors.paper-accent}'
    textColor: '{colors.graphite-ink}'
  button-destructive:
    backgroundColor: '{colors.status-down}'
    textColor: '{colors.status-on-color}'
    rounded: '{rounded.md}'
    height: '40px'
  input-field:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.graphite-ink}'
    rounded: '{rounded.md}'
    padding: '4px 12px'
    height: '40px'
  label-tape:
    backgroundColor: '{colors.laminated-tape}'
    textColor: '{colors.tape-ink}'
    typography: '{typography.label-tape}'
    rounded: '{rounded.tape}'
    padding: '0 8px'
    height: '24px'
  label-tape-section:
    backgroundColor: '{colors.laminated-tape}'
    textColor: '{colors.tape-ink}'
    rounded: '{rounded.tape}'
    padding: '0 10px'
    height: '28px'
  status-tag-available:
    backgroundColor: '{colors.status-ok}'
    textColor: '{colors.status-on-color}'
    typography: '{typography.label-tape}'
    rounded: '{rounded.tape}'
    padding: '0 8px'
    height: '24px'
  status-tag-unavailable:
    backgroundColor: '{colors.status-down}'
    textColor: '{colors.status-on-color}'
    typography: '{typography.label-tape}'
    rounded: '{rounded.tape}'
    padding: '0 8px'
    height: '24px'
  status-tag-unknown:
    backgroundColor: '{colors.paper-muted}'
    textColor: '{colors.graphite-muted-ink}'
    typography: '{typography.label-tape}'
    rounded: '{rounded.tape}'
    padding: '0 8px'
    height: '24px'
  service-card:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.graphite-ink}'
    rounded: '{rounded.md}'
    padding: '16px'
  rail:
    backgroundColor: '{colors.rack-rail}'
    textColor: '{colors.rack-rail-ink}'
    width: '{spacing.rail-width}'
  rail-item-active:
    backgroundColor: '{colors.tape-yellow}'
    textColor: '{colors.tape-yellow-ink}'
    typography: '{typography.title}'
    rounded: '{rounded.md}'
---

# Design System: Homora

## Overview

**Creative North Star: "A Etiqueta de Patch Panel"**

Tudo no Homora é rotulado, como o rack de quem organiza a própria casa. A fita laminada de rotuladora é a assinatura: títulos de seção e o estado de cada serviço usam a linguagem de fita, enquanto grupos de serviços têm títulos mais discretos. O resto é grafite aquecido (matiz 70) e papel quente, calmo e denso o suficiente para um painel de uso diário. O sistema recusa o painel genérico de cards iguais com ponto de estado.

A barra superior é grafite nos dois temas, como uma referência ao rack. O conteúdo vive em papel quente no tema claro e em grafite escuro no tema escuro. A cor tem papel funcional: amarelo de fita preenche a ação principal, o item ativo de navegação e o foco; verde, vermelho e cinza dizem apenas estado. Barlow Semi Condensed rotula, Figtree lê, JetBrains Mono mostra endereços e contagens.

**Key Characteristics:**

- Fita laminada branca com texto preto em caixa-alta como sinal-assinatura (LabelTape, StatusTag).
- Barra superior grafite nos dois temas; gerenciamento acessível por um botão.
- Amarelo de fita só como preenchimento, nunca como texto.
- Estado sempre com ícone, texto e cor.
- Plano: sem sombra decorativa, profundidade por tom e borda.
- Base shadcn/ui (new-york, Radix, lucide, Tailwind v4), tema por classe `dark`.

## Colors

Grafite aquecido e papel quente, com um único amarelo de fita e três cores de estado. Todos os valores vêm de `src/style.css` e são mantidos em OKLCH, fonte normativa do projeto. Os nomes do frontmatter mapeiam as variáveis shadcn (`--primary`, `--background`, `--sidebar` e assim por diante); o tema escuro redefine as mesmas variáveis sob `.dark`.

### Primary

- **Amarelo de Fita** (`tape-yellow`, `--primary`): preenchimento da ação principal (Adicionar serviço), de itens ativos quando aplicável, seleção de texto e `accent-color`. No escuro vira `tape-yellow-dark`. O texto sobre ele é `tape-yellow-ink`, grafite quase preto.

### Secondary

- **Verde de Disponível** (`status-ok`, `status-ok-night`): estado disponível, preenchimento da etiqueta com texto claro.
- **Vermelho de Fora do Ar** (`status-down`, `status-down-night`): estado indisponível e ações destrutivas; borda, fundo a 10% e anel no card do serviço fora do ar.

### Neutral

- **Papel Quente** (`warm-paper`): fundo do conteúdo no claro. **Papel de Card** (`paper-card`): cards, campos, popovers.
- **Tinta de Grafite** (`graphite-ink`) e **Tinta Apagada** (`graphite-muted-ink`): texto principal e secundário no claro.
- **Borda de Papel** (`paper-border`) para divisões; **Borda de Campo** (`paper-input-border`) mais firme para campos; **Foco Grafite** (`focus-graphite`) para o anel de foco no claro. No escuro o anel de foco é o amarelo.
- **Trilho de Rack** (`rack-rail`, `rack-rail-dark` no escuro) com tinta `rack-rail-ink`, hover `rack-rail-hover` e borda `rack-rail-border`.
- **Fita Laminada** (`laminated-tape`, `night-tape` no escuro) com tinta `tape-ink`: só em LabelTape.
- **Grafite Noturno** (`night-graphite`), `night-card`, `night-popover`, `night-ink`, `night-muted`, `night-muted-ink`, `night-border`, `night-input-border`: superfícies e texto do tema escuro.
- **Cinza de Sem Informação** usa `paper-muted` com `graphite-muted-ink` e anel de borda: estado desconhecido ou monitoramento bloqueado.

### Named Rules

**The Never-Yellow-Text Rule.** O amarelo de fita é preenchimento de ação principal, item ativo e foco. Nunca é cor de texto, de ícone solto nem de link.

**The Status-Needs-Words Rule.** Verde, vermelho e cinza significam estado e vêm sempre com ícone e texto. Cor sozinha nunca comunica estado.

## Typography

**Display/Label Font:** Barlow Semi Condensed 500/600/700 (com Figtree Variable e system-ui)
**Body Font:** Figtree Variable (com system-ui, sans-serif)
**Data Font:** JetBrains Mono Variable (com ui-monospace)

**Character:** Condensada e firme nos rótulos, como letra de rotuladora; legível e amigável no corpo; monoespaçada onde a pessoa copia ou compara endereços e números.

### Hierarchy

- **Headline** (600, 1.875rem, 1.25): título de página (`h1`), tracking -0.025em, `text-balance`.
- **Title** (600, 1rem, 1.5): `h2`/`h3` e títulos secundários, em Barlow.
- **Body** (400, 1rem, 1.5): texto corrido e descrições; largura máxima de 65ch no cabeçalho de página. Campos usam 0.875rem a partir de `md`.
- **Label** (700, 0.8125rem, 0.08em, caixa-alta): texto de LabelTape; StatusTag usa 0.06em.
- **Data** (400, 0.8125rem): host do serviço, contagens com `tabular-nums`.

### Named Rules

**The Tape-Voice Rule.** Caixa-alta e tracking aberto pertencem só ao texto de fita (LabelTape e StatusTag). Em qualquer outro lugar o texto segue a caixa normal.

## Layout

Barra superior grafite com marca, tema, saída e acesso ao gerenciamento. O conteúdo ocupa até 72rem (`max-w-6xl`), com margens laterais de 16px e 32px a partir de `md`. A tela inicial apresenta busca, resumo de disponibilidade e grupos; a navegação administrativa aparece ao entrar em Gerenciar. A grade de serviços tem uma coluna no celular, duas a partir de `sm` e três a partir de `xl`, com intervalo de 12px. Alvos de toque crescem para 44px em ponteiro grosso.

## Elevation & Depth

O sistema é plano. Profundidade vem de tom (barra mais escura que o papel, card mais claro que o fundo) e de borda de 1px, nunca de sombra projetada. A única exceção é a borda de laminação da fita: um filete interno de 1px a 20% de preto mais um fio de 1px embaixo, que faz a tira parecer papel laminado. Ela vive só em LabelTape.

### Named Rules

**The Flat-By-Default Rule.** Sem sombra decorativa em cards, botões, popovers ou campos. Foco usa anel de 3px (`ring/50`), não sombra.

**The Lamination-Edge Rule.** O filete de fita pertence só a LabelTape. Não o copie para outras superfícies para ganhar relevo.

## Shapes

Raio base de 8px (`--radius`), com 6px, 10px e 14px nos degraus. Controles e cards usam 8px; a fita usa 3px, quase reta, como corte de rotuladora. Bordas de 1px definem os cards; o card em modo Organizar troca para borda tracejada. Serviço fora do ar ganha borda e anel vermelhos e fundo vermelho a 10%. Ícones são sempre Lucide, 16px em botões e 14px dentro de fita.

## Components

### Buttons

- **Shape:** cantos de 8px, altura 40px (44px em ponteiro grosso); `sm` 36px, `xs` 24px, `lg` 44px, ícone 40px.
- **Primary:** amarelo de fita com texto grafite, peso 600, padding 8px 16px; hover a 90% de opacidade.
- **Outline / Secondary / Ghost / Destructive / Link:** outline em card com borda de campo; secondary em papel; ghost só ganha fundo no hover; destructive em vermelho com texto claro; link sem fundo.
- **Focus:** anel de 3px a 50%; desabilitado a 50% de opacidade.

### Inputs / Fields

- **Style:** fundo de card, borda `paper-input-border`, 8px, altura 40px.
- **Focus:** borda e anel de 3px na cor de foco.
- **Error / Disabled:** borda e anel vermelhos em `aria-invalid`; desabilitado a 50%.

### Cards / Containers

O serviço é um Item com borda, fundo de card, 16px de padding e hover em `accent/40`. O link cobre o card inteiro; ações de editar e remover ficam no canto, a 50% de opacidade em ponteiro fino até hover ou foco.

### Navigation

Barra superior grafite com marca e botão Gerenciar. Na área administrativa, a navegação fica lateral em telas maiores e acima do conteúdo no celular; o item ativo usa a variante secundária. Voltar ao início retorna ao painel de serviços.

### LabelTape (assinatura)

Tira branca laminada (24px de altura, 28px em título de seção) com Barlow 700 em caixa-alta, 0.8125rem, tracking 0.08em, texto preto, raio 3px e borda de laminação. Identifica tipos de recurso quando necessário; títulos de seção são discretos por padrão. Grupos de serviços usam título em Barlow, ícone de pasta, contagem discreta e um separador horizontal. Nas áreas de integrações e agentes, títulos de seção usam texto e separador discretos, sem fita. Em `src/components/label-tape.tsx`.

### StatusTag (assinatura)

Etiqueta de estado com a mesma geometria da fita: ícone Lucide de 14px mais texto em caixa-alta. Disponível em verde com CircleCheck; Indisponível em vermelho com CircleX; Sem informação e Monitoramento bloqueado em cinza com anel de borda, com CircleHelp e ShieldOff. Em `src/components/status-tag.tsx`; o resumo de saúde reúne várias numa linha.

### Base shadcn e componentização

Base shadcn/ui estilo new-york com Radix (`radix-ui`), ícones lucide, Tailwind v4 com tokens em `@theme inline` e tema por classe `dark` (`@custom-variant dark`). Primitivos vivem em `src/components/ui`, componentes de produto em `src/components`, telas em `src/pages` e módulos de domínio em `src/features`. Todo elemento da interface é um componente; não se escreve marcação solta nas páginas.

## Do's and Don'ts

### Do:

- **Do** usar títulos discretos como padrão em seções e StatusTag para todo estado de serviço; LabelTape fica reservada a usos explícitos, como o tipo de recurso.
- **Do** reservar o amarelo de fita para a ação principal, o item ativo e o foco.
- **Do** compor telas com primitivos de `components/ui` e componentes de `components`, colocando páginas em `pages` e módulos em `features`.
- **Do** mostrar endereços e contagens em JetBrains Mono.
- **Do** manter a barra superior grafite nos dois temas e trocar o tema só pela classe `dark`.

### Don't:

- **Don't** usar amarelo como cor de texto, de link ou de ícone solto.
- **Don't** comunicar estado só por cor: sempre ícone mais texto.
- **Don't** adicionar sombra decorativa; o filete de laminação da LabelTape é a única borda em relevo.
- **Don't** voltar ao painel genérico de cards iguais com ponto de estado.
- **Don't** usar caixa-alta com tracking aberto fora do texto de fita.

## Navegação da tela inicial

A tela inicial prioriza busca, disponibilidade e abertura dos serviços. A barra superior grafite mantém a marca, tema, saída e o acesso discreto a **Gerenciar**. A área de gerenciamento reúne serviços e grupos, integrações e agentes; a edição e remoção de cards ficam nessa área. A disposição se adapta a telas pequenas sem expor abas administrativas na tela inicial.

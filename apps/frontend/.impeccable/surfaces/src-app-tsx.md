---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface brief: Homora (app inteira)

Modo: Operate. Serviços, Integrações e Agentes, mais a tela de acesso.

## Público, tarefa e restrições
Quem mantém um homelab e abre serviços todo dia; de vez em quando organiza, conecta integrações e revisa propostas de agentes. Tarefa principal: abrir um serviço em um clique e ver se está no ar. pt-BR, teclado completo, telas pequenas, tema claro e escuro, shadcn/ui (base radix) sobre Tailwind v4 com todos os elementos como componentes.

## Direction contract

THESIS: Tudo no Homora é rotulado, como o rack de quem organiza a própria casa: a fita da rotuladora é a assinatura. Recusa o painel genérico de cards iguais com ponto de estado.
OWN-WORLD: grafite aquecido (oklch ~0.2, matiz 70), trilho lateral grafite nos dois temas, conteúdo em papel quente no claro e grafite no escuro; amarelo de fita (oklch ~0.88 0.17 95) só como preenchimento de ação principal e foco, nunca como texto; estados verde/vermelho/cinza sempre com texto e ícone. Barlow Semi Condensed para rótulos e títulos, Figtree no corpo, JetBrains Mono para endereços e dados. Raio 6-8px, sem sombra decorativa.
STORY: a pessoa entende em segundos o que está no ar, abre qualquer serviço em um clique e sabe o que pede atenção; propostas de agentes aparecem como mudanças revisáveis com decisão explícita.
FIRST VIEWPORT: trilho de 232px à esquerda com marca, navegação (Serviços, Integrações, Agentes), tema e sair; à direita busca com atalho Ctrl K e ação principal Adicionar serviço; abaixo o resumo de saúde numa linha e os grupos, cada um com título em fita (tira branca laminada, texto preto em caixa-alta) sobre grade de serviços; serviço fora do ar sobe com etiqueta de estado em destaque. No celular o trilho vira barra de abas inferior.
FORM: Etiqueta de patch panel, escolha do Impeccable. seed:f5c5d0470b6ce9b7. Sinal-assinatura: LabelTape (título de grupo e de seção) e StatusTag (estado como etiqueta de fita com ícone e texto).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

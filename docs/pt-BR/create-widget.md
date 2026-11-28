# Criar um widget local

Antes de começar, leia o [ADR 0026](../decisions/0026-widget-modules.md), o [ADR 0019](../decisions/0019-widget-sdk.md), o [catálogo](../widget-catalog.md) e os [padrões de engenharia](../standards.md) (referências em inglês). Novas fontes, permissões e tamanhos exigem escopo aprovado separadamente.

Execute `pnpm widget:create meu-widget` com um tipo único, minúsculo e separado por hífens. O comando cria um exemplo funcional em `packages/widgets/src/widgets/meu-widget` e registra definição, mensagens, UI e exportação do pacote. Ele recusa nomes existentes; revise todas as alterações geradas. Não é necessário editar rotas, transferência, planner, layout, diálogo ou galeria do host.

- Em `definition.ts`, implemente padrões versionados e validação estrita em `parseConfig`; mantenha a lógica pura junto da definição. Arquivos compilados não podem importar React nem `@homora/ui`.
- Em `ui/`, implemente visualização, editor e galeria usando o contexto do host e os componentes compartilhados. Defina `category` (`'time' | 'monitoring' | 'feeds' | 'utilities'`; se omitido, o widget vai para `other`) e `keywords` opcionais em `WidgetUI` para os filtros e busca da galeria. O diálogo de criação/edição renderiza uma prévia ao vivo automaticamente usando `View` + `parse` (`Preview` é opcional para prévias customizadas). Não importe o aplicativo, integrações ou outros módulos de widget. Mova utilitários puros reutilizáveis para fora dos módulos individuais.
- Substitua as mensagens em inglês e português em `messages.ts`. O registro gerado as reúne nos recursos do host.
- Amplie o teste de definição e adicione testes de UI para comportamento, configuração inválida, acessibilidade e casos relevantes. Preserve configurações armazenadas e exportações portáveis ao alterar um widget.

Execute os testes específicos, `pnpm check` e `pnpm build`; valide a galeria e os layouts relevantes no navegador e registre o que não foi verificado. O scaffold é interno e não é uma API de plugins nem uma autorização para acesso à rede.

Widgets de página podem declarar `sizes: ['normal', 'wide']` na definição quando esse escopo for aprovado; omitir o campo significa apenas normal. O host guarda a escolha. Largo ocupa duas colunas na faixa a partir de `sm` e aparece normal no painel lateral e em telas pequenas; todo widget deve funcionar na largura normal.

As fontes internas de monitoramento são registradas por contrato e versão, não exigem conexão e são portáveis. Consulte o [ADR 0027](../decisions/0027-widget-internal-monitoring.md) (em inglês) para contratos, limites, dados desatualizados e privacidade. O host fornece a leitura; o widget não deve acessar a infraestrutura de monitoramento diretamente. As apresentações MON ficam para outras issues.

No Resumo, cada widget é uma célula de uma grade de 12 colunas. Declare `summary` (largura e altura padrão e mínimas)
quando o padrão geral (4 ou 8 colunas conforme o tamanho, 2 linhas, no mínimo 3×1) não servir. `summaryOnly` é para
widgets sobre os dados do próprio Início, desenhados pela aplicação: adicione o desenho em `summaryRenderers` (um
teste exige) e as opções em `summaryOptions`; veja o [ADR 0033](../decisions/0033-summary-widgets.md).

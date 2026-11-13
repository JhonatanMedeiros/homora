# Abertura de links por serviço — análise da issue 165

## Experiência proposta

Ao criar ou editar um serviço, mostrar junto ao endereço o campo **Abrir link**,
com as opções **Nova aba** e **Mesma aba**. A primeira permanece selecionada por
padrão, inclusive para serviços existentes. As opções devem ser visíveis e
mutuamente exclusivas, acessíveis por teclado e traduzidas para inglês e português.
Em telas pequenas, o controle deve caber na largura do formulário sem exigir
rolagem horizontal. A escolha é salva com o serviço, junto às demais alterações.

O comportamento deve ser igual nas visualizações de lista, cartões, hosts e mapa,
e ao abrir um resultado ou serviço recente na paleta. Links devem continuar sendo
links nativos, para permitir menu de contexto e modificadores do navegador. Para
nova aba, manter `rel="noopener noreferrer"` e o aviso para leitores de tela;
para mesma aba, não anunciar uma nova aba. O atalho Shift+Enter da paleta continua
indo ao cartão, pois tem uma função própria.

## Estado atual e implicações

- Os cartões em lista e em grade e os links nas visualizações de hosts e mapa
  usam `target="_blank"`; a paleta usa `window.open` com o mesmo destino.
- A configuração do serviço passa pelo contrato compartilhado, validação da API,
  SQL de criação e atualização, edição, propostas e importação/exportação. Alterar
  só o componente visual não preservaria a preferência.
- As atualizações que omitem a propriedade devem preservar o valor existente,
  inclusive quando forem originadas por fluxos antigos ou propostas. Novos serviços
  sem a propriedade usam nova aba.

## Implementação sugerida

1. Acrescentar ao contrato um campo opcional com valores explícitos `new-tab` e
   `same-tab`, validado na API. Adicionar coluna com padrão `new-tab` por migração
   compatível, preservando serviços existentes. Incluir o campo nas leituras e
   escritas de serviços, inclusive propostas e importação.
2. Exportar a escolha no formato nativo YAML/JSON e aceitar arquivos antigos sem
   o campo como nova aba. Para valor inválido, apresentar aviso na prévia em vez
   de alterar silenciosamente a intenção. Não presumir equivalência com opções de
   Homepage ou Dashy sem verificar seus formatos.
3. Inserir o controle no formulário e conservar a escolha no rascunho de edição.
   Centralizar a decisão de destino para as quatro apresentações de links e para
   a paleta, mantendo o comportamento nativo dos links e a proteção de nova aba.
4. Atualizar a documentação de uso e de importação/exportação. Só registrar a issue
   como concluída após os critérios e as verificações abaixo serem atendidos.

## Verificação necessária

- Migração em banco temporário com dados anteriores: serviços e demais campos
  preservados e abertura em nova aba. Criar, editar e atualizar sem enviar o campo.
- Importar arquivos antigos e fazer roundtrip YAML e JSON nos dois modos; validar
  também valores inválidos e propostas que não mencionem a preferência.
- Testar lista, grade, hosts, mapa e paleta nos dois modos e no padrão; verificar
  indicação acessível, proteção de nova aba, teclado e modificadores de links.
- Inspecionar o formulário em larguras desktop e móvel, nos temas claro e escuro,
  e executar `pnpm check` e `pnpm build`.

Esta análise registra a direção escolhida para a implementação da issue.

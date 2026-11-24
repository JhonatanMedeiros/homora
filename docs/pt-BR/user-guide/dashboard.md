# Dashboard

O dashboard reúne seus serviços em páginas e grupos. A saúde fica no cabeçalho, em uma pílula que mostra a situação geral e abre os detalhes e as causas prováveis dos problemas.

![Dashboard do Homora](../../screenshots/dashboard-dark.png)

## A pílula de saúde

A pílula no cabeçalho responde "está tudo certo?" de relance: um ponto colorido e poucas palavras (**Tudo certo**, **2 problemas**, **Monitoramento parcial**, **Sem dados** ou **Sem medição**). No celular aparece só o ponto. Ao selecioná-la, abre um painel com os serviços fora do ar e há quanto tempo, a disponibilidade média, os incidentes da semana, o tempo médio de recuperação e a meta de disponibilidade, além das **causas prováveis**: o que os serviços provavelmente têm em comum (um convidado parado ou host offline do Proxmox, o mesmo erro começando em até dez minutos ou um endereço que não responde). Cada causa pode ser **reconhecida** ou **silenciada por 1 h**; isso só silencia o dashboard, sem alterar verificações, incidentes ou notificações. Quando todas as verificações falham pelo mesmo motivo, a pílula diz **Sem medição** em vez de listar tudo como fora do ar.

## Navegação e organização

Use a busca ou `Ctrl K` para localizar serviços e configurações. Os filtros ajudam a encontrar itens offline, degradados ou favoritos. Quando há um Proxmox conectado, a lista **Hosts** na lateral mostra cada nó com seu estado e quantos cartões rodam nele; selecioná-lo mostra os cartões daquele nó. O sino mostra eventos de indisponibilidade e recuperação. Páginas separam conjuntos de serviços; grupos organizam os cartões dentro de cada página. As páginas ficam em uma barra própria abaixo do cabeçalho, com a contagem de serviços e quantos estão fora do ar; o botão de lista no fim da barra abre **Todas as páginas** (uma folha na parte de baixo no celular), com busca quando há mais de seis páginas, um menu `⋯` por página e o botão **Adicionar página**.

Em **Organizar**, adicione, edite, mova ou remova cartões e grupos. É possível alterar a quantidade de colunas e a disposição. Os cartões podem ser exibidos em diferentes layouts; as visualizações de host e mapa ajudam a entender relações entre serviços e infraestrutura.

## Detalhes e widgets

Abra os detalhes de um serviço para consultar verificações, latência e histórico. Marque serviços como favoritos para acessá-los com facilidade. Widgets de página exibem informações como relógio e dados de integrações; widgets de cartão aparecem junto ao serviço.

O widget **Agenda de manutenção** mostra janelas em andamento e futuras no fuso horário do navegador. Escolha um horizonte de 24 horas, 7 dias ou 30 dias, até 10 linhas e filtros opcionais por página e grupo. Janelas em andamento aparecem independentemente de quando começaram. Seleções renomeadas ou removidas permanecem no editor para atualização e não passam a incluir tudo. Falhas de atualização são distintas de uma agenda vazia, e leituras anteriores são identificadas como desatualizadas. Sem filtros, sondas independentes também podem aparecer; selecioná-las abre o gerenciamento de sondas.

No celular, a interface adapta a navegação e os controles à tela. Pressione `?` para consultar os atalhos disponíveis.

[Leia a referência completa do dashboard em inglês](/user-guide/dashboard).

Quando um widget de página oferecer tamanhos, escolha normal ou largo no editor. Largo ocupa duas colunas acima dos grupos quando há espaço; no painel lateral e em telas pequenas usa a largura normal. Os tamanhos disponíveis dependem do widget.

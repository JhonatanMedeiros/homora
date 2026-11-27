# Serviços e monitoramento

## Avaliar impacto potencial das dependências

No mapa, selecione um serviço ou um host convidado e escolha **Avaliar impacto potencial** nos
detalhes. A avaliação do convidado começa pelos cartões explicitamente vinculados a ele. As setas
apontam da dependência para o cartão que a utiliza; cada resultado mostra um caminho mais curto
registrado e indica se é direto ou transitivo. Selecione um cartão visível para revisar suas relações.
Os serviços ficam disponíveis no mapa mesmo quando nenhum está vinculado a um host.

São percorridas apenas dependências manuais entre serviços. Hosts sugeridos não são vínculos
confirmados e não entram no cálculo; a ausência de um caminho registrado não comprova que um serviço
esteja livre de impacto. Impacto potencial não é uma falha observada nem um diagnóstico. Resultados
são limitados a oito etapas e 100 monitores dependentes, com aviso de truncamento; ciclos não causam
repetição infinita. Falhas de leitura são distintas de um grafo vazio, e leituras com mais de dois
minutos devem ser atualizadas. O retrato usa o vocabulário de evidência para relações registradas e
completude desconhecida, sem estabelecer histórico de dependências ou garantir completude.

Agentes com `services:read` já podem consultar as relações manuais por `list_service_dependencies` e
calcular caminhos, sem novas permissões ou acesso a infraestrutura externa. Sugestões de host exigem
o escopo `hosts:read` existente e permanecem separadas das dependências confirmadas.

O resumo e a investigação autenticados resolvem nomes de serviços localmente. Sondas, serviços removidos
e nomes indisponíveis usam o ID do monitor; os bundles de evidências e as respostas MCP não recebem nomes.

Em **Gerenciar → Atividade**, o resumo de mudanças agrupa eventos por monitor nas últimas 24 horas ou
em 7 dias. As contagens de início e recuperação contam eventos; o total conta incidentes distintos com
ao menos um evento no período. As contagens usam todo o período retido mesmo quando os detalhes são
limitados. São exibidos até 100 monitores e 100 eventos individuais, com avisos separados de truncamento.
Um resultado vazio não comprova histórico completo nem identifica uma causa.
A duração não é agregada: incidentes podem estar abertos ou se estender além do período selecionado.

## Revisar a cobertura de monitoramento

Em **Atividade**, selecione **Revisar cobertura de monitoramento** para avaliar a configuração atual
e as últimas observações utilizáveis. A avaliação apresenta alvos ausentes, bloqueios pela política
de destino, pausas de manutenção e observações desatualizadas (mais de duas vezes o intervalo de
verificação) ou indisponíveis. Acesse a configuração para revisar o serviço ou a sonda. Uma
observação ausente não significa que o monitor esteja desativado; manutenção não é indisponibilidade.

Cada cartão de serviço já possui um monitor; o intervalo não configurado usa o padrão. A avaliação
não infere a intenção de receber alertas, não verifica canais e não comprova cobertura completa.
Ela não altera configurações nem permissões de rede. Os resultados podem ser ignorados e são
recalculados ao atualizar; não há dispensa persistente. A lista mostra os primeiros 100 resultados.
Atualize avaliações antigas antes de agir. O recurso é determinístico e não exige IA.

Um serviço representa um endereço que você deseja abrir e, opcionalmente, monitorar. O formulário permite configurar nome, URL, categoria, ícone, aparência, verificações, conexões e acesso à rede.

A URL deve ser `http` ou `https`, sem usuário nem senha; `http://` é acrescentado quando você omite. Um endereço já usado por outro cartão é avisado, sem impedir o salvamento. Fechar o formulário com alterações pede confirmação. O que foi digitado nos campos do cartão permanece nesta aba do navegador se a sessão expirar ou a página recarregar, até salvar, descartar ou sair.

![Formulário de serviço](../../screenshots/service-form.png)

## Tipos de verificação

O Homora oferece verificações HTTP(S), ping, TCP, DNS, validade de certificado TLS, palavra-chave e valor em resposta JSON. Configure o tipo, destino, intervalo e opções adequadas ao serviço. O endereço aberto no navegador e o destino de monitoramento podem ser diferentes.

Endereços privados exigem autorização explícita no serviço; loopback, link-local e outras faixas proibidas continuam bloqueados. Um destino não autorizado aparece como **Sem monitoramento**, sem abrir incidente nem enviar notificação. A validação de TLS permanece ativa. Consulte as regras e limites detalhados no [guia em inglês](/user-guide/services-and-monitoring).

## Estados e incidentes

Os cartões mostram estados como disponível, indisponível, degradado, manutenção ou aguardando. A ausência de uma observação confiável não é tratada como sucesso. Os detalhes mostram o motivo, a latência e as verificações recentes.

Configure limites de falhas e recuperação para reduzir alertas por oscilações. Os incidentes, o histórico de disponibilidade e as janelas de manutenção ajudam a entender quando houve um problema e por quanto tempo. A manutenção agendada não é uma confirmação de que o serviço funciona.

![Detalhes de disponibilidade de um serviço](../../screenshots/service-detail.png)

Também é possível registrar onde um serviço roda e suas dependências, para visualizá-las nas telas de host e mapa. Um serviço que não roda em nenhum guest (nuvem, VPN) pode ser marcado como **externo** no mapa; ele sai das sugestões e aparece em **Externos**. Vínculos de host, a marca de externo e dependências não vão na exportação e importação. Veja [dashboard](dashboard.md) e [alertas](notifications-and-status-page.md).

[Leia a referência completa de serviços e monitoramento em inglês](/user-guide/services-and-monitoring).

## Investigar um incidente

Escolha **Investigar incidente** nos detalhes do serviço ou em **Gerenciar → Atividade**.
A linha do tempo mostra o incidente registrado, até 100 checagens retidas e até 20 incidentes
simultâneos; dados truncados, inválidos ou de cobertura desconhecida são indicados. A coincidência
de horários é uma hipótese, não prova uma causa comum. O histórico de checagens é retido por
30 dias; as dependências históricas e a causa podem ser desconhecidas. Os horários usam o fuso
do navegador. A visão é determinística, não exige modelo, não inicia checagens nem faz alterações
externas.

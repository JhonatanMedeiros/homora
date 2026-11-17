# Integrações e widgets

Integrações são opcionais e permitem exibir dados de serviços externos. As consultas são de leitura; Homora não altera a infraestrutura por meio delas. Uma **conexão** guarda o endereço e as credenciais de um serviço. Um **widget** apresenta dados dessa conexão em um cartão ou em uma página.

![Página de integrações](../../screenshots/integrations.png)

## Adicione uma conexão

1. Abra **Gerenciar → Integrações** e escolha adicionar uma conexão.
2. Selecione o tipo e preencha endereço e credenciais. Prefira uma conta ou token somente de leitura.
3. Autorize rede privada quando necessário. Para uma autoridade certificadora privada, informe apenas o certificado público PEM.
4. Salve e teste. O cartão informa o resultado e a causa de uma falha.

A conexão é feita pelo backend, portanto o endereço precisa ser acessível a partir de onde o Homora roda. `localhost` dentro de um contêiner aponta para o próprio contêiner. Conexões autenticadas exigem HTTPS e validação de certificado; não desative TLS para contornar erros.

## Widgets

Na aba de widgets, escolha o tipo, a conexão e o cartão. Widgets de página podem ser adicionados no dashboard; o relógio e a nota não exigem conexão. A nota aceita até 4.000 caracteres de Markdown básico: parágrafos, quebras de linha, negrito, itálico, listas e links HTTP(S). Ela pode ter um nome opcional e acompanha as exportações da configuração. HTML, imagens, tabelas e blocos de código não são exibidos como tais. A barra superior opcional pode mostrar data, hora e dados de uma conexão Proxmox.

As integrações incluem Proxmox, Jellyfin, Home Assistant e outras. A cobertura e a validação ao vivo variam; consulte a [referência de integrações em inglês](/integrations) antes de depender de uma integração específica.

Para criar uma integração, siga o [guia do SDK em inglês](/adapters). Para contêineres, veja [descoberta Docker](docker-discovery.md).

[Leia o guia completo de integrações e widgets em inglês](/user-guide/integrations-and-widgets).

## Contagem regressiva

Adicione o widget de página **Contagem regressiva** para um evento. Informe nome, data e hora locais e escolha um fuso IANA ou o fuso do navegador. O contador atualiza a cada minuto enquanto a aba está visível. Após o evento, ele permanece visível em texto atenuado por padrão; selecione **Ocultar automaticamente** para escondê-lo. Widgets ocultos permanecem salvos; use **Gerenciar contagens ocultas** para editá-los ou removê-los. Cada evento usa um widget.

Se uma mudança de horário tornar a hora ambígua, vale a primeira ocorrência. Se a hora não existir, ela avança pelo intervalo da mudança. A data e hora resolvidas ficam visíveis; o contador não anuncia cada minuto. Contagens são incluídas na exportação e importação sem conexão.

A arquitetura interna dos módulos de widget e suas fronteiras estão descritas no [ADR 0026 em inglês](/decisions/0026-widget-modules).

## Calendário mensal

Adicione um widget de página **Calendário** para ver o mês atual sem conexão. Escolha o primeiro dia da semana ou **Automático**, que segue o idioma da interface, e um fuso IANA ou o fuso do navegador. Navegue entre meses e use **Hoje** para voltar. O mês exibido é temporário; ao recarregar, volta ao mês atual. A data atualiza à meia-noite com a aba visível e ao retornar a uma aba oculta. Números de semana e eventos não são exibidos. O calendário aceita os tamanhos normal e largo; sua configuração é incluída na exportação e importação.

Adicione **Resumo do homelab** para ver as contagens atuais de monitores online, degradados, offline, em manutenção e sem medição. Ele usa o monitoramento interno do Homora e não precisa de conexão. Escolha grupos e páginas para limitar o resumo; uma seleção vazia inclui todos. Probes independentes são incluídos quando nenhum grupo ou página está selecionado. É possível ocultar a linha sem medição; a contagem continua no total e na barra. Selecione um estado para filtrar a Home. Fora da Home as contagens são informativas. O widget identifica leituras antigas ou falhas. As seleções usam nomes: um nome ausente após importar não corresponde a nada.

## Incidentes recentes

Adicione **Incidentes recentes** para ver interrupções do monitoramento, das mais recentes para as mais antigas, com incidentes em andamento primeiro. Escolha 24 horas, 7 dias ou 30 dias, até 10 itens (5 por padrão), uma duração mínima opcional e filtros opcionais de páginas e grupos. Ao selecionar os dois filtros, ambos devem corresponder; não selecione nenhum para incluir todos, inclusive sondas independentes. Um clique no serviço abre sua gaveta; em uma sonda, abre a página de sondas. O tamanho largo mostra o motivo curto do monitor; o rail e telas pequenas usam a apresentação normal. Cada incidente ocupa uma linha, mesmo quando há vários do mesmo serviço. Datas usam o fuso do navegador.

O período inclui incidentes que o atravessam, inclusive um incidente antigo ainda em andamento. Atualmente não há poda automática por idade dos incidentes, mas o monitoramento pode não ter existido durante todo o período escolhido. Os dados atualizam a cada minuto; se a atualização falhar, o último resultado permanece marcado como desatualizado. Os filtros usam nomes para sobreviver à exportação e importação; após renomear ou remover uma página ou grupo, edite os filtros. O widget e sua configuração são portáveis e não precisam de conexão.

### Problemas atuais

Adicione **Problemas atuais** para manter visíveis os monitores offline e degradados por latência. Os problemas offline mais antigos aparecem primeiro, seguidos dos degradados, com o motivo curto do monitor e o tempo desde o início do incidente, quando conhecido. A degradação por latência mostra quando foi observada pela primeira vez na execução atual do servidor; após reiniciar, a duração anterior é desconhecida. Escolha de 1 a 10 itens (cinco por padrão), inclua ou não a degradação por latência e selecione páginas e grupos. Uma seleção vazia inclui todos; quando ambas estão preenchidas, o cartão deve corresponder às duas. Sondas independentes não têm grupo nem página e aparecem apenas quando ambas as seleções estão vazias. Abra uma linha de cartão para ver seus detalhes; uma sonda abre o gerenciamento de sondas.

Monitores em manutenção, sem medição ou bloqueados por política não entram na lista; uma linha discreta conta os dois últimos. O widget indica quantos resultados estão visíveis quando há mais, avisa sobre leituras desatualizadas e mantém a leitura anterior se a atualização falhar. Ele atualiza a cada minuto sem executar uma nova verificação. Cada widget tem seu próprio estado de erro. Não exige conexão e acompanha a exportação da configuração. Os filtros usam nomes de páginas e grupos para permitir a transferência entre instalações; após renomear um deles, atualize a seleção do widget.

### Feed RSS / Atom

Adicione **Feed RSS / Atom** para acompanhar entradas recentes de um feed RSS 2.0 ou Atom 1.0 diretamente em uma página do painel. Configure a URL do feed, um título de exibição opcional e quantas entradas mostrar (1–10, cinco por padrão). O widget suporta tamanhos normal e largo e é incluído nas exportações e importações de configuração sem exigir conexão.

Os feeds são buscados exclusivamente pelo backend com tempo limite de 8 segundos, limite de resposta de 512 KB, sem redirecionamentos e com cache em memória. Por padrão, apenas HTTPS e endereços públicos são permitidos, e URLs com credenciais embutidas (`user:pass@`) são rejeitadas. Ative **Permitir HTTP e endereços de rede privada/LAN** apenas para feeds confiáveis na sua rede local. Marcações nos títulos são removidas para texto puro, links das entradas são restritos a `http:` e `https:`, e falhas na atualização mantêm as últimas entradas em cache marcadas como desatualizadas.

### Clima

Adicione **Clima** para exibir as condições atuais (temperatura, condição e máxima/mínima de hoje) e uma previsão curta em uma página do painel. O widget suporta os tamanhos `normal` (previsão de 3 dias) e `largo` (previsão de até 5 dias com sensação térmica, umidade, velocidade do vento e probabilidade de chuva), além de unidades em `°C (Métrico)` e `°F (Imperial)`.

Escolha entre o provedor **Open-Meteo** sem chave de API (padrão) ou **OpenWeatherMap** (exige uma chave de API, armazenada criptografada no servidor e nunca incluída na configuração da página ou exportações). Configure o local pela busca de cidades no backend, coordenadas manuais e rótulo opcional, ou pelo botão sob demanda de geolocalização do navegador (disponível apenas em contextos seguros como `https:` ou `localhost` e nunca acionado automaticamente ao carregar). As requisições de clima passam pelo backend com cache em memória de 10 minutos, e falhas de atualização mantêm a última previsão em cache marcada como desatualizada.

### Histórico de latência de serviço

Adicione **Histórico de latência** e selecione um cartão de serviço. Escolha 24 horas, 7 dias ou 30 dias e tamanho normal ou largo. O gráfico mostra a mediana das verificações bem-sucedidas em cada intervalo; lacunas indicam que nenhuma medição válida foi registrada. Uma falha curta pode ficar oculta em um intervalo que também tenha verificações bem-sucedidas. São exibidas apenas verificações brutas retidas por até 30 dias e correspondentes à configuração atual do monitor.

Quando a medição estiver desatualizada ou o serviço não puder ser medido, o widget identifica a última medição válida e seu horário, sem chamá-la de atual. Uma verificação fica desatualizada após mais de duas vezes o intervalo configurado. Se o cartão for excluído, selecione outro explicitamente. A exportação preserva período e tamanho, mas limpa a seleção local; escolha o serviço novamente após importar. Backups do banco preservam a seleção.

### Validade dos certificados

O widget de página **Validade dos certificados** lista cartões de serviço configurados com verificação TLS, começando pela expiração mais próxima. Ele mostra até cinco e informa quando há mais resultados. O aviso de 7, 14, 30 ou 60 dias afeta apenas a apresentação, sem alterar o monitoramento ou os alertas. Um certificado não expirado ainda pode ser inválido. Após uma falha, uma observação anterior pode aparecer com seu horário; uma expiração desconhecida não é considerada expirada. As observações são mantidas por até 30 dias e correspondem à configuração atual da verificação. O widget não executa novas verificações.

Os filtros opcionais de páginas e grupos usam nomes para portabilidade. Se um nome selecionado for removido ou renomeado, edite o widget: a seleção não é ampliada automaticamente. Se a atualização falhar, o último resultado fica marcado como desatualizado. Selecione uma linha para abrir os detalhes do serviço.

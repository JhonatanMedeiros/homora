# ADR 0019: SDK interno e posicionamento de widgets

Status: aceita para os widgets incluídos nesta implementação.

## Contexto

As apresentações de integração eram acopladas ao catálogo de integrações e às linhas
`integration_widgets`. Essas linhas exigem conexão; as que não têm card continuam disponíveis
apenas na tela de integrações. O relógio e a seleção de telemetria da barra superior pertencem
ao navegador. O [inventário](../inventario-widgets-159.md) descreve as superfícies anteriores.

## Decisão

`@homora/widgets` é um pacote interno sem dependência de integração, servidor ou React. Declara
localizações, versão, configuração validada, fonte opcional, estados e apresentações de
estatísticas e do relógio. O relógio é uma definição local, sem fonte ou rede. Telemetria da barra superior
requer o contrato `system-telemetry` versão 1. Uma fonte satisfaz uma necessidade somente quando
nome do contrato e versão coincidem; ausência só satisfaz ausência.

`@homora/integrations` depende do contrato comum, nunca o contrário. O registro continua explícito
no build: apresentações em código e manifestos permanecem nos diretórios das integrações. Cada
saída de integração usa um contrato específico `integration:<tipo>` versão 1; só integrações que
declaram a capacidade de telemetria oferecem o contrato compartilhado de telemetria. O catálogo
adapta ambas as formas de apresentação ao mesmo contrato sem duplicar regras específicas. Os
exports anteriores de apresentação continuam disponíveis como aliases de compatibilidade.

O host controla sessão, persistência, localização, atualização, transporte e credenciais. Ele
valida configuração e compatibilidade antes de salvar, e o adaptador valida as observações antes
da apresentação. Widgets não recebem credenciais nem rede direta. Leituras de integração usam a
API existente e o cache por conexão; widgets de página agrupam leituras por conexão em cada ciclo
de 60 segundos. Falhas e dados inválidos são exibidos por instância. Não há API de estado próprio
mutável nesta entrega: uma futura capacidade deverá ser mediada e autorizada pelo host; integrações
externas continuam somente leitura.

## Dados e ciclo de vida

A migração aditiva cria `page_widgets` com identidade, página, tipo, nome, configuração, versão,
fonte opcional e posição. Nenhuma linha existente é convertida. O host valida a versão 1 na leitura
e escrita; versões desconhecidas não são editadas ou interpretadas. A remoção de uma página com
widgets exige destino e move as instâncias na mesma transação. Conexões usadas não podem ser
removidas. A remoção de uma instância não apaga sua conexão. Configurações de relógio e fonte da
barra superior permanecem locais ao navegador. A API e MCP de widgets legados permanecem sem
alteração; widgets de página não são expostos nem editáveis pelo MCP nesta entrega.

Exportação Homora versão 3 usa nome de página e, para fontes, tipo e nome da conexão, nunca IDs ou
credenciais. A importação aceita versões antigas e é aditiva: relógios são adicionados; widgets
conectados são listados como ignorados na prévia e devem ser recriados com uma conexão escolhida
pelo usuário. Não há vínculo automático por nome, inclusive quando houver apenas uma conexão
candidata. Alterações de página ou widget invalidam prévias por meio da versão de configuração.
Backups do banco continuam sendo o mecanismo de recuperação integral, incluindo vínculos locais.

## Alternativas e consequências

Reinterpretar `service_id = NULL` criaria widgets inesperados e alteraria propostas pendentes;
uma tabela separada evita essa mudança. Tornar todo dado de integração uma lista genérica de
estatísticas apagaria suas garantias semânticas; contratos específicos evitam compatibilidade
falsa. Um pacote independente evita ciclo de dependências, mas exige incluí-lo no build e nas
imagens. O catálogo é interno e compilado com o produto: esta decisão não oferece SDK público,
instalação dinâmica, plugins de terceiros ou acesso adicional à rede.

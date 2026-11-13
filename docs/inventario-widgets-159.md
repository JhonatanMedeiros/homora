# Inventário de widgets para a issue #159

Este documento registra o comportamento existente antes da migração. Não descreve um SDK de
widgets implementado nem altera a interpretação dos dados salvos.

## Apresentações de integrações

O catálogo de integrações registra doze tipos. Proxmox, Coolify e Pi-hole fornecem apresentações em
código; AdGuard Home, Cloudflare, Home Assistant, Jellyfin, NetBird, Portainer, Speedtest
Tracker, Tailscale e Uptime Kuma usam `display` nos manifestos. Definições, traduções,
fixtures e testes de contrato continuam sob os respectivos diretórios em
`packages/integrations/src/integrations`. O catálogo gerado registra explicitamente as três
fábricas em código; `createWidgetRenderer` resolve tanto elas quanto os manifestos. A saída
comum atual é uma lista de rótulos e valores e, para a visualização de dados, um resumo.
Dados inválidos produzem `null`; texto remoto não é interpretado como HTML.

| Superfície                      | Fonte e configuração                                                                                                      | Atualização e estados                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card e lista de serviços        | `integration_widgets` com `service_id`; conexão obrigatória, nome e tipo próprios                                         | Lista e leituras a cada 60 s; uma leitura por conexão em cada ciclo. Loading, erro, dados inválidos e dados prontos são isolados por widget. Falha ao listar deixa os cards sem widgets. |
| Integrações, aba Widgets        | As mesmas linhas, inclusive `service_id = NULL`; conexão escolhida na criação e fixa na edição                            | Consulta de dados sob demanda, resumo traduzido ou indicação de dados inválidos. A ausência de card significa somente ausência de vínculo com card.                                      |
| Barra superior: telemetria      | Conexão selecionada no navegador com capacidade `systemTelemetry`; sem seleção, usa o primeiro widget com essa capacidade | Consulta a cada 60 s; loading, nenhuma conexão, erro, nó indisponível e dados prontos. Exibe apenas estatísticas identificadas de CPU, memória e disco.                                  |
| Barra superior: relógio         | Relógio e fuso do navegador, com preferências locais de formato, fuso, data e segundos                                    | Atualização alinhada ao próximo segundo ou minuto; `Intl` formata hora, data e fuso. Um fuso salvo não suportado usa o fuso do navegador. Não depende de conexão.                        |
| Configurações da barra superior | Mesmas preferências locais e seleção de conexão                                                                           | Prévia reutiliza o componente de relógio; opções permanecem independentes em cada navegador.                                                                                             |

As leituras de conexão são mediadas pelo backend e seu cache de observação tem TTL de 30 s;
falhas não são armazenadas. O host mantém credenciais e transporte restrito. O fato de dois
resultados serem listas de estatísticas não os torna fontes intercambiáveis: por exemplo,
a barra superior depende dos identificadores semânticos de CPU, memória e disco.

## Compatibilidade a preservar

- IDs, nomes, tipos, conexões e vínculos das linhas existentes devem manter seu significado.
  Em particular, não converter linhas sem card em widgets de página.
- A API e o MCP operam sobre `integration_widgets`; propostas pendentes e suas verificações de
  estado obsoleto usam esses dados. Qualquer mudança de representação precisa preservar essas
  leituras e a revisão humana.
- As preferências da barra superior pertencem ao navegador, não ao banco compartilhado. Não
  criar instâncias de página a partir delas silenciosamente.
- O resultado Proxmox pode indicar nó indisponível e aceita respostas antigas sem disco;
  Coolify omite contagens zero opcionais. Essas regras permanecem nas integrações.
- O contrato futuro precisa separar configuração, localização e fonte, validar compatibilidade
  de fonte explicitamente e preservar tradução, agrupamento de leituras e isolamento de falhas.
  O inventário não escolhe ainda uma representação persistida nem autoriza acesso direto à rede.

## Trabalho pendente

Definir e registrar a ADR e os contratos, implementar o SDK e as instâncias de página, migrar
as apresentações e a barra superior, tratar transferência e compatibilidade, e executar as
validações de integração e navegador exigidas pela issue. Nenhum critério de implementação da
issue é considerado concluído por este inventário.

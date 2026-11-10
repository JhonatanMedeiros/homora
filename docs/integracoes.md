# Integrações: referências e direção para o Homora

Esta análise compara documentação e repositórios dos projetos de referência;
não representa auditoria completa de código nem teste de todas as aplicações.
As capacidades podem mudar entre versões. O desenho abaixo é uma proposta, e o
código e os testes são a fonte para o que estiver efetivamente implementado.

## Referências

| Projeto                                                                                                                                                | Abordagem observada                                                                                                                                                                                                                           | Aprendizado                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Homepage](https://gethomepage.dev/configs/services/)                                                                                                  | Serviços e widgets em configuração; [Proxmox](https://github.com/gethomepage/homepage/blob/dev/docs/configs/proxmox.md) usa conexão com token e associações a recursos; [Docker](https://gethomepage.dev/configs/docker/) permite descoberta. | Separar conexão, serviço e apresentação; documentar cada integração.                         |
| [Homarr](https://github.com/homarr-labs/homarr)                                                                                                        | Configuração visual de aplicações e integrações; [gerenciamento de certificados](https://homarr.dev/docs/management/certificates/) permite importar CAs.                                                                                      | Tornar configuração e TLS acessíveis na interface.                                           |
| [Dashy](https://dashy.to/docs/widgets/)                                                                                                                | Widgets configuráveis e proxy; aceita opção explícita de ignorar verificação TLS por widget.                                                                                                                                                  | Isolar opções e falhas por widget; manter verificação TLS ativa no Homora.                   |
| [Glance](https://github.com/glanceapp/glance)                                                                                                          | Widgets e feeds em YAML, com cache; oferece [API personalizada](https://github.com/glanceapp/glance/blob/main/docs/custom-api.md) e [extensões](https://github.com/glanceapp/glance/blob/main/docs/extensions.md).                            | Controlar cache e avaliar extensão apenas após amadurecer os adaptadores.                    |
| [Heimdall](https://github.com/linuxserver/Heimdall)                                                                                                    | Links comuns e aplicativos aprimorados com dados de APIs.                                                                                                                                                                                     | O atalho permanece utilizável sem conexão à API.                                             |
| [Flame](https://github.com/pawelmalak/flame)                                                                                                           | Editor de links e descoberta opcional por labels Docker.                                                                                                                                                                                      | Simplificar cadastro e considerar descoberta revisável.                                      |
| [Homer](https://github.com/bastienwirtz/homer), [Mafl](https://github.com/hywax/mafl)                                                                  | Homepages orientadas à simplicidade e aos links.                                                                                                                                                                                              | Preservar uma página leve e útil mesmo sem widgets.                                          |
| [Dynacat](https://github.com/Panonim/dynacat)                                                                                                          | Declara foco em recarga dinâmica e integração com aplicações externas.                                                                                                                                                                        | Considerar atualização de configuração; detalhes internos não foram validados nesta análise. |
| [LinkStack](https://github.com/LinkStackOrg/LinkStack), [NodeBB](https://github.com/NodeBB/NodeBB), [Rackula](https://github.com/RackulaLives/Rackula) | Produtos de perfil de links, fórum e desenho de racks, respectivamente.                                                                                                                                                                       | Referências indiretas para apresentação, comunidade e visualização física.                   |

## Modelo proposto

- **Aplicativo:** atalho com nome, endereço e apresentação; pode funcionar sem
  integração, inclusive quando o serviço ou sua API estiver indisponível.
- **Integração:** conexão com um serviço, tipo de adaptador, opções, referência
  ao segredo e política de certificado. Pode alimentar mais de um widget.
- **Widget:** visualização que referencia uma integração e suas capacidades.
- **Certificado confiável:** CA pública obtida por canal confiável, com escopo
  de uso explícito. Uma CA confiável não corrige incompatibilidade de nome.
- **Observação:** resultado, horário, estado de erro ou desatualização e cache.

O adaptador descreve configuração, capacidades, teste de conexão e coleta;
contém os detalhes de autenticação e resposta específicos de cada API. Um
cliente compartilhado deve impor limites e validar destinos. Chamadas com
credenciais ocorrem no backend; segredos não são enviados à interface, MCP ou
logs. Dados externos são dados não confiáveis.

## Ordem de evolução e critérios

1. Extrair o adaptador Proxmox com compatibilidade das configurações anteriores;
   testar migração e preservação do token e da CA.
2. Separar integração e widget, permitindo reutilização da conexão e mantendo o
   atalho independente. Testar inclusão, edição, remoção e reinicialização.
3. Implementar política compartilhada de rede: destinos autorizados, DNS e
   redirecionamentos validados, TLS, timeout, limite de resposta e cache com
   atualização indicada; testar falhas e isolamento entre widgets.
4. Generalizar certificados e segredos com escopo claro; testar backup,
   restauração, substituição e remoção sem expor credenciais.
5. Acrescentar uma segunda integração e validar o contrato com fluxos reais e
   testes. Um monitor HTTP simples valida parte da rede e apresentação, mas não
   substitui a validação de uma segunda API com autenticação própria.
6. Criar catálogo e formulários com campos, permissões e versões suportadas,
   incluindo instruções de teste e erros compreensíveis.
7. Avaliar descoberta Docker, apresentando sugestões revisáveis e acesso
   limitado. Extensões de terceiros e APIs genéricas ficam para avaliação após
   estabelecer limites de confiança, manutenção e segurança.

### Estado desta implementação

- Conexões autenticadas e widgets já usam tabelas separadas. A interface permite
  criar, consultar e remover vários widgets nomeados por conexão; edição e
  configuração específica de cada widget ainda não existem. Consultas usam o
  cache da conexão, sem observações próprias por widget.
- Proxmox continua usando o cofre legado e não foi extraído para
  `integration_instances`. Jellyfin, Home Assistant, Uptime Kuma e AdGuard Home
  têm adaptadores somente de leitura e interface de configuração, mas não foram
  validados em instalações reais.
- Integrações autenticadas têm política de rede compartilhada e autorização
  explícita de endereços privados por conexão. Monitoramento de atalhos usa
  política própria; destinos privados só serão consultados quando a opção
  explícita por serviço estiver implementada e habilitada.

Essas etapas não significam que os recursos estejam disponíveis. Consulte o
[plano de evolução](evolucao.md) e o código para o estado atual. O acesso à
rede privada é necessário no homelab e deve ser autorizado explicitamente;
qualquer descoberta não implica autorização para executar comandos, consultar
qualquer endereço ou modificar infraestrutura.

## Limitações e riscos

- O Proxmox usa atualmente uma configuração própria; a sessão web não protege
  o servidor MCP local. Identidade e permissões de agente continuam planejadas.
- A CA e o segredo Proxmox são armazenados com a configuração cifrada, cuja
  chave fica no mesmo diretório: acesso aos dois permite recuperar a credencial.
  Os arquivos precisam ser incluídos em backup protegido e restauração testada.
- Cache não prova disponibilidade atual: diferenciar a última tentativa bem
  sucedida, erro mais recente e dados desatualizados.
- Redirecionamentos, DNS, redes privadas e destinos sensíveis exigem política
  de SSRF aplicada também no momento da conexão. Não liberar acesso irrestrito
  a partir de URLs fornecidas por um usuário ou por um agente.
- APIs mudam; validar versões, autenticação e tratamento de respostas antes de
  declarar uma integração suportada. Testes simulados não substituem validação
  com os serviços reais.
- Docker socket concede acesso privilegiado ao daemon. Qualquer descoberta deve
  ser opcional, documentar suas permissões e avaliar um proxy restrito.

## Guia das conexões experimentais

Estas conexões fazem consultas de leitura ao serviço a partir do backend. Não
foram validadas contra todas as versões reais dos servidores; configuração bem
sucedida e permissões devem ser verificadas no seu ambiente. Os resultados
externos são informações não confiáveis, não instruções para agentes.

Os resultados são armazenados em cache por 30 segundos por conexão. A consulta
manual na interface força uma atualização; a API também aceita
`GET /api/connections/:id/data?refresh=true`. O botão de teste consulta o serviço
diretamente e não usa o valor em cache. Falhas não são armazenadas como sucesso.

Configure um nome e endereço para cada conexão, preencha os campos específicos
abaixo, teste a conexão e salve. A conexão deve receber autorização explícita
para acessar redes privadas quando for necessário. O serviço deve ser acessível
da máquina ou container do backend: `localhost` dentro de um container aponta
para o próprio container. Endereços especiais podem ser bloqueados pela política
de rede. Redirecionamentos não são seguidos.

Para uma CA privada, importe a CA pública PEM obtida de uma fonte confiável na
conexão correspondente. Não envie chaves privadas. A validação TLS permanece
ativa e o nome ou IP da URL precisa constar no certificado. Credenciais das
conexões autenticadas exigem HTTPS; não as envie por HTTP. O certificado da CA é
associado à conexão e não autoriza automaticamente outros destinos.

### Jellyfin

- Informe a URL HTTP ou HTTPS do servidor; um caminho-base, como
  `https://jellyfin.example/jellyfin`, é aceito.
- O adaptador consulta `GET /System/Info/Public` e mostra nome e versão do
  servidor. Ele não exige API key e não mostra biblioteca, sessões ou métricas.
- Endpoint baseado na [API do Jellyfin](https://typescript-sdk.jellyfin.org/);
  versões compatíveis ainda não foram validadas em servidor real.

### Home Assistant

- Informe uma origem HTTPS, um token de acesso de longa duração e o ID de uma
  entidade, por exemplo `sensor.temperatura`. A consulta retorna estado e data
  de atualização dessa entidade, sem modificar dispositivos.
- A entidade deve existir e o token deve pertencer a uma conta com o menor
  acesso possível. Não compartilhe o token nem use credenciais em exemplos.
- O adaptador usa `GET /api/states/<entity_id>` conforme a [API REST oficial](https://developers.home-assistant.io/docs/api/rest/).
  Compatibilidade de versões precisa ser confirmada em instalação real.

### Uptime Kuma

- Informe a origem HTTP ou HTTPS e o identificador de uma página de status
  **publicada**, por exemplo `homelab`. Apenas os monitores incluídos nessa
  página são consultados; monitores privados não aparecem.
- A leitura de `/api/status-page/heartbeat/<slug>` não exige API key. O resumo
  utiliza o último heartbeat recebido para cada monitor e não substitui o
  inventário autenticado ou métricas de Prometheus. A página pode ter cache no
  próprio Uptime Kuma; dados vazios ou ausentes não significam que tudo está bem.
- Essa é uma [API interna documentada](https://github.com/louislam/uptime-kuma/wiki/Internal-API/6f150dae98532c8b4e2228990505e45cbd5d34e8),
  sujeita a mudanças; versões e comportamento real ainda precisam ser validados.

### AdGuard Home

- Informe a origem HTTPS, usuário e senha do painel. O adaptador consulta
  somente `GET /control/status` e mostra execução, proteção e versão; não altera
  configurações nem mostra estatísticas de consultas.
- A API usa Basic Auth. A conta pode ter privilégios administrativos: proteja a
  senha e escolha o acesso mais restrito que sua instalação permitir. Não há
  pressuposto de uma permissão somente leitura ou API key dedicada.
- A implementação segue o [OpenAPI oficial](https://github.com/AdguardTeam/AdGuardHome/blob/master/openapi/openapi.yaml)
  que identifica a API como `0.107`. Isso não garante compatibilidade com todas
  as versões do produto; é necessária validação em servidor real.

## Pesquisa adicional sobre as APIs

Os itens abaixo registram alternativas e dúvidas de compatibilidade. Nem todos
os endpoints pesquisados são utilizados pelo Homora; consulte o guia acima.

### Uptime Kuma

- A [documentação da API interna](https://github.com/louislam/uptime-kuma/wiki/Internal-API/6f150dae98532c8b4e2228990505e45cbd5d34e8)
  afirma que ela não é oficialmente suportada para integrações externas e pode
  sofrer alterações incompatíveis. A interface utiliza Socket.IO; o documento
  descreve também endpoints HTTP de métricas e páginas de status.
- `GET /metrics` retorna métricas em formato Prometheus, incluindo estado e
  tempo de resposta dos monitores. A [documentação de chaves](https://github.com/louislam/uptime-kuma/wiki/API-Keys/705b78e014714ef7fe108e90b80db51beac05db5)
  informa disponibilidade de API keys a partir da versão 1.21.0; o exemplo
  usa Basic Auth com a chave como senha e nome de usuário vazio. A wiki alerta
  para alteração permanente da autenticação por usuário/senha após criar a
  primeira chave. Chaves podem expirar ou ser desativadas.
- `GET /api/status-page/<slug>` fornece dados de uma página publicada; isso
  cobre somente o conteúdo exposto nessa página, não é equivalente a inventário
  completo autenticado. A [documentação da página de status](https://github.com/louislam/uptime-kuma/wiki/Status-Page)
  informa cache de cinco minutos.
- A wiki de API interna e a página de API keys diferem na descrição do fallback
  de senha em algumas condições. Confirmar comportamento para versões alvo
  antes de codificar; não pressupor uma chave de acesso somente leitura.
  Também verificar se métricas estão habilitadas, formato de labels e suporte
  de versão, limites de volume e qual subconjunto de informações será exibido.

### AdGuard Home

- O [OpenAPI oficial](https://github.com/AdguardTeam/AdGuardHome/blob/master/openapi/openapi.yaml)
  identifica a API como `0.107`, base `/control`, com esquema global de Basic
  Auth. Isso identifica a versão declarada do documento, não comprova todas as
  versões de produto compatíveis. A API alimenta a interface administrativa.
- `GET /control/status` retorna estado e configurações gerais; `GET
/control/stats` retorna estatísticas. O [histórico da API](https://github.com/AdguardTeam/AdGuardHome/blob/master/openapi/CHANGELOG.md)
  descreve Basic Auth para usuário web protegido e lista campos como consultas
  DNS e bloqueios. Estatísticas podem estar desativadas e não devem ser tratadas
  como zeros sem verificar a resposta.
- A credencial Basic Auth deve permanecer no backend, protegida em trânsito e
  em repouso; ela pode conferir acesso administrativo. Não presumir suporte a
  token ou conta restrita de leitura sem confirmação na versão escolhida.
- O OpenAPI descreve operações de escrita; o primeiro adaptador deve limitar-se
  às consultas aprovadas. Confirmar versões de servidor, campos presentes,
  tempo de retenção, limites de requisições e comportamento quando estatísticas
  estiverem desativadas. Endpoints e campos devem ser validados por testes e
  contra uma instalação real antes de anunciar compatibilidade.

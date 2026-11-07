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

## Pesquisa para futuras integrações

Os itens abaixo são pesquisa inicial, não indicam suporte implementado nem
compatibilidade comprovada. Antes de implementar, fixar versões do servidor e
executar testes com instâncias reais, inclusive cenários de autenticação e TLS.

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

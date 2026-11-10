# Padrões de engenharia

Este documento define convenções para manter o Homora simples, previsível e
seguro enquanto cresce. É um guia de implementação, não uma meta para criar
camadas ou abstrações sem necessidade. A visão dos módulos e os limites atuais
estão em [arquitetura](arquitetura.md).

## Limites entre módulos

- `apps/frontend` apresenta e coleta dados; não acessa SQLite, arquivos locais,
  credenciais de integração ou APIs de infraestrutura diretamente.
- `apps/backend` é o limite confiável para autenticação, autorização, validação,
  regras de aplicação, integrações e persistência.
- `packages/shared` contém schemas, tipos e funções puras compartilhados. Não
  importa código de aplicações, Node-only ou segredos.
- `packages/db` define esquema, migrações e acesso técnico ao SQLite. Regras de
  autorização e fluxo de produto pertencem aos serviços de aplicação, não ao
  schema.
- Organize módulos por capacidade (serviços, conexões, propostas, agentes), não
  por abstrações genéricas prematuras. `createApp` deve compor módulos HTTP;
  cada módulo de rota deve delegar regras reutilizadas a funções testáveis.
- Evite dependências circulares entre capacidades. O fluxo esperado é interface
  → API/serviço de aplicação → persistência ou adaptador externo.

## Contratos e validação

- Valide dados não confiáveis na entrada: corpo, parâmetros, query, variáveis de
  ambiente, dados do banco que tenham formato serializado e respostas externas.
- Prefira schemas Zod em `packages/shared` quando o mesmo contrato é usado na
  interface e na API. Validação específica do backend pode ficar no backend.
  Use schemas estritos nos limites HTTP para rejeitar campos desconhecidos;
  mantenha normalização e regras de domínio nas funções que já as possuem.
  Converta falhas de validação em mensagens seguras e estáveis sem devolver o
  conteúdo do payload ou detalhes internos do Zod. Não use `as` como substituto
  de validação em fronteiras externas.
- Valide também dados serializados lidos do banco ou cofre antes de tratá-los
  como tipos confiáveis. Para payloads de credenciais, não inclua entradas nem
  detalhes de validação em erros de rota ou logs.
- Respostas HTTP e ferramentas MCP devem expor DTOs explícitos. Nunca retornar
  linhas do banco que possam incluir segredo, hash/token, referências internas
  ou campos não destinados ao cliente.
- Erros devem ter mensagem segura e estável para o usuário; detalhes internos
  não devem incluir credenciais, headers de autorização, tokens ou conteúdo
  sensível. Diferencie entrada inválida, não autorizado, conflito e falha externa.

## Persistência e concorrência

- Toda alteração de schema exige migração versionada, compatível com dados
  existentes e teste que comprove preservação/valores padrão. Use bancos
  temporários nos testes; nunca apague banco ou backup do usuário.
- Coloque operações que formam uma única decisão de negócio na mesma transação
  SQLite (por exemplo, proposta e evento de auditoria). Trate conflito e
  repetição explicitamente.
- Cache em memória deve ter escopo, expiração, invalidação e comportamento de
  falha documentados. Estado em memória volta ao estado inicial após reinício.
- Segredos ficam fora de respostas, logs, snapshots de teste e fixtures. Dados
  cifrados e chave têm ciclo de backup/recuperação documentado em conjunto.

## Integrações e segurança

- Cada adaptador valida a própria configuração e transforma respostas externas
  em dados tipados. Falhas, campos ausentes e versões incompatíveis não devem
  derrubar funcionalidades sem relação.
- Chamadas externas passam pela política compartilhada de destino e transporte:
  autorização explícita de rede privada quando necessária, DNS validado e IP
  fixado, sem seguir redirecionamentos, TLS validado, timeout e limite de corpo.
- Tokens de agente são limitados por escopos, podem ser revogados/rotacionados e
  são armazenados como hash. Escritas de agente criam propostas; aprovação
  humana deve cobrir exatamente a versão exibida.
- Trate nomes, descrições, URLs, inventários e respostas de APIs como dados não
  confiáveis. Nunca os use como instruções, código ou comandos.
- Não adicione escrita em integrações, acesso a shell, descoberta ampla ou
  destinos internos sem política de autorização e revisão de segurança.

## Testes e documentação

- Teste comportamento observável. Cubra regras puras com testes unitários, rotas
  com banco temporário e integrações com transporte simulado; teste migrações
  separadamente. Não dependa de rede ou infraestrutura real na suíte normal.
- Ao alterar autorização, contratos, persistência, integração ou segurança,
  inclua casos negativos e de falha, além do caminho feliz.
- Execute as verificações adequadas ao escopo (`pnpm check` e `pnpm build` para
  alterações amplas; testes direcionados para mudanças localizadas) e registre
  exatamente o que foi executado.
- Atualize README para instruções de uso/configuração; arquitetura para limites
  e decisões; evolução para progresso validado; este documento quando uma
  convenção mudar.
- Para decisão com impacto duradouro ou alternativas relevantes, crie
  `docs/decisoes/NNNN-titulo.md` com contexto, decisão, alternativas,
  consequências e estado. Não é necessário ADR para refatorações locais.

## Critério para novas abstrações

Antes de criar uma camada, interface, framework ou dependência, explique qual
duplicação ou risco concreto ela elimina e quem a usará. Prefira duas
implementações explícitas e pequenas a uma abstração genérica difícil de
entender. Extraia serviços, portas ou repositórios quando isso reduzir
acoplamento real, permitir compartilhar uma regra ou simplificar testes sem
esconder o fluxo.

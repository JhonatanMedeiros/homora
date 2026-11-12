# Homora

[English](README.md) · **Português (Brasil)**

Um espaço pessoal para visualizar e organizar serviços, infraestrutura e informações do seu ambiente, com integrações e gerenciamento assistido por agentes de IA.

**Estado:** versão inicial local, em desenvolvimento.

## Documentação

- [Glossário do domínio](GLOSSARY.md)
- [Visão e produto](docs/produto.md)
- [Arquitetura e segurança](docs/arquitetura.md)
- [Padrões de engenharia](docs/padroes.md)
- [Referências e arquitetura de integrações](docs/integracoes.md)
- [Estratégia e posicionamento frente ao Homepage e ao Dashy](docs/estrategia.md)
- [Plano de entrega](docs/plano.md)
- [Plano de evolução e acompanhamento](docs/evolucao.md)
- [Orientações para agentes de IA](AGENTS.md)
- [Como contribuir](CONTRIBUTING.md)
- [Licença MIT](LICENSE) e [avisos de terceiros](THIRD_PARTY_NOTICES.md)
- [Política de segurança](SECURITY.md)

## Recursos disponíveis

- Painel de serviços com grupos, ordem por arraste (modo Organizar), número de colunas por grupo (1 a 6, mantido nas exportações), busca e um estado por serviço exibido como No ar, Fora do ar ou Aguardando, com a latência. Redirecionamento e pedido de login contam como No ar, e o card com falha explica o motivo (não encontrado, erro do servidor, sem resposta) e abre um painel de Detalhes com as checagens recentes.
- Ícones por emoji, nome (`lucide:server`), logo de marca embutido (`brand:plex`, 164 apps de homelab e self-hosting, servidos localmente, sem requisições externas) ou URL de imagem. O formulário sugere o logo que coincide com o nome do serviço.
- Interface em inglês e português (Brasil); o idioma segue o navegador e pode ser trocado no botão de idioma.
- Exportação e importação de serviços e grupos em YAML ou JSON, e importação de arquivos do Homepage (`services.yaml`, `bookmarks.yaml`) e do Dashy (`conf.yml`), sempre com prévia. Veja [Importar e exportar](#importar-e-exportar).
- Método de verificação por serviço (requisição HTTP ou ping) e intervalo por serviço (30 a 3600 segundos), também mantidos nas exportações.
- Widgets dentro do card: ligue um widget (dados do Proxmox, Jellyfin, Home Assistant, Uptime Kuma ou AdGuard Home) a um card na página Integrações. Cada widget mostra o próprio estado de carregamento ou erro, e uma conexão com falha não afeta os outros cards.
- Faixa superior opcional (ative em Configurações) com data, hora e uso de CPU, memória e disco da conexão Proxmox escolhida.
- Descoberta Docker opcional: sugere cards a partir de labels de contêineres (`homora.url` ou o `homepage.href` do Homepage), com etapa de revisão. Veja [Descoberta Docker](#descoberta-docker).
- Integrações experimentais de leitura (Proxmox, Jellyfin, Home Assistant, Uptime Kuma, AdGuard Home) e agentes de IA com permissões, via MCP local.

Ideias e recursos planejados estão em [estratégia](docs/estrategia.md) e no [plano de evolução](docs/evolucao.md), separados do que já existe.

## Princípios

Interface agradável e acessível, configuração simples, dados sob controle do usuário, integrações extensíveis e ações de agentes sujeitas às mesmas permissões que ações humanas. O primeiro alvo é uma instalação pessoal; portabilidade e múltiplos usuários ficam para depois da validação do MVP.

## Desenvolvimento local

Requisitos: Node.js 24 (veja `.nvmrc`) e pnpm 12.4.2. No WSL:

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

A autenticação usa `/login` e retorna à rota local solicitada após a entrada. O painel fica em `/`; o gerenciamento usa `/manage/services`, `/manage/integrations`, `/manage/agents` e `/manage/settings`, com navegação pelo histórico do navegador. Os formulários de serviço usam `/manage/services/new` e `/manage/services/:id/edit`; rotas desconhecidas mostram uma página de erro. Em hospedagem própria da interface, configure o servidor para retornar `index.html` nessas rotas.

Abra <http://localhost:5173>. O Vite encaminha `/api` para o backend Fastify local na porta 3000. `pnpm dev` usa o banco isolado `data/homora-dev.sqlite`, criado com serviços fictícios na primeira execução. Alterações persistem entre reinícios e serviços removidos não são recriados. Os endereços são ilustrativos, sem autorização de monitoramento privado. O primeiro acesso exige criar a conta de administrador. Fora do desenvolvimento, o banco padrão é `data/homora.sqlite` e pode ser configurado por `HOMORA_DATABASE_PATH`; essa variável não altera o banco isolado de `pnpm dev`. Para encerrar, use Ctrl+C.

O monorepo usa pnpm e Turborepo, com React, Vite, Tailwind CSS e shadcn/ui no frontend, Node.js e TypeScript no backend, contratos compartilhados e Drizzle ORM com SQLite. Execute `pnpm build`, `pnpm type-check` e `pnpm test` para verificar o projeto. `pnpm db:generate` gera migrações a partir do esquema Drizzle. Na inicialização, as migrações são aplicadas em uma transação; bancos anteriores são adotados somente quando o esquema é compatível. Faça backup do banco antes de atualizar o projeto.

Esta versão permite cadastrar serviços, criar uma conta de administrador local e configurar integrações de leitura em caráter experimental. Veja os serviços, requisitos e limites em [integrações](docs/integracoes.md). O MCP local permite consultas autorizadas e propostas de alteração de cards, sempre sujeitas à revisão humana. O Docker Compose está em fase inicial de validação. A aplicação é configurada para acesso local e não deve ser exposta na rede.

O acesso local usa HTTP em loopback. Para acesso remoto, ainda não há um perfil de rede privada validado. Um proxy reverso pode ser configurado com HTTPS e a origem pública declarada em `HOMORA_ALLOWED_ORIGINS` (lista separada por vírgulas); o proxy deve encaminhar `Host` e `X-Real-IP`, manter a API inacessível diretamente e não desativar a validação de origem. Esse modo exige configuração e validação operacional próprias e não torna a exposição pública segura por si só.

## Importar e exportar

Em **Configurações** você baixa grupos, cards e a ordem deles em YAML ou JSON (`GET /api/config/export`). O arquivo não contém senhas, tokens, conexões nem IDs, e pode ser versionado. Para importar, escolha o formato (Homora, Homepage ou Dashy) e o arquivo; o Homora mostra uma prévia com o que entra, o que já existe e o que foi ignorado, e só grava ao confirmar. A importação apenas adiciona: nada é sobrescrito nem removido. Cards importados não recebem permissão de rede privada, a menos que você marque essa opção para um arquivo do Homora em que confia.

Ícones de outros painéis só são mantidos quando têm equivalente (URL, emoji, logo de marca ou um dos ícones embutidos); os demais ficam vazios, com aviso. Widgets, monitoramento e vínculos com Docker do Homepage e do Dashy não são importados. Os formatos foram conferidos na documentação desses projetos; arquivos reais podem variar.

## Qualidade e commits

- `pnpm check`: ESLint, Prettier, tipos e testes.
- `pnpm test`, `pnpm test:watch` e `pnpm test:coverage`: Vitest.
- `pnpm lint`, `pnpm lint:fix`, `pnpm format` e `pnpm format:check`: análise e formatação.
- O Husky executa lint-staged no pre-commit e Commitlint no commit-msg. Use mensagens como `feat: adiciona integração`. Os hooks são instalados pelo `pnpm install`; para reinstalá-los, execute `pnpm exec husky`.

Migrações geradas e arquivos de skills vendorizadas são excluídos das verificações globais de formatação e lint.

## Backup local

Crie uma cópia consistente do banco (não sobrescreve arquivos existentes):

```bash
pnpm backup data/homora.sqlite backups/homora.sqlite
```

Guarde o arquivo em um local protegido. Para restaurar, pare o Homora, preserve o banco atual e use o backup como origem de um novo arquivo; por exemplo: `pnpm backup backups/homora.sqlite data/restaurado.sqlite`. Aponte `HOMORA_DATABASE_PATH` para esse arquivo e reinicie o Homora. Verifique os dados antes de remover qualquer cópia anterior. Este backup contém o banco, que inclui a conta de administrador e as sessões. As conexões incluem credenciais cifradas no banco; a chave de cifragem fica no arquivo `.key` ao lado dele, e a integração Proxmox original usa também `.proxmox`. Copie esses arquivos existentes separadamente em um backup protegido e restaure-os com os mesmos nomes derivados do caminho do banco. A chave e o conteúdo cifrado juntos permitem recuperar credenciais. Sem a chave, as credenciais precisarão ser configuradas novamente. Um arquivo `.auth` deixado por versões anteriores não é mais lido e pode ser apagado.

## Atualização e recuperação

Atualize a cópia do projeto para a versão desejada e, antes de iniciar o código
novo, faça backup do banco e dos arquivos auxiliares existentes (`.key` e
`.proxmox`) conforme descrito acima. Com Compose, atualize o checkout e
execute `docker compose up -d --build`; o volume nomeado `homora-data` é
preservado e as migrações são aplicadas na inicialização. Faça primeiro esse
processo com cópias dos dados se a instalação contiver informações importantes:
esta atualização ainda não foi validada entre versões.

Para recuperar, pare a aplicação, preserve os arquivos atuais e restaure o
banco e os auxiliares correspondentes a partir do backup protegido. Em Compose,
os arquivos auxiliares ficam ao lado do banco dentro de `/app/data` no volume;
use um backup isolado e confirme os dados antes de voltar a iniciar a versão
atualizada. Não há procedimento automatizado de downgrade de migração; se uma
migração falhar, mantenha o volume original e restaure uma cópia de segurança
em uma cópia de trabalho antes de retomar o serviço.

## Sessões, redefinição de senha e rotação de segredos

- **Sessões** ficam no banco por oito horas e sobrevivem a um reinício do backend. O cookie (`homora.session_token`) é `HttpOnly`, `SameSite=Strict` e, ao entrar por uma origem HTTPS, `Secure`. Ele é assinado com um segredo guardado em `<banco>.session-secret` (criado automaticamente, modo 0600) ou vindo de `HOMORA_SESSION_SECRET` (mínimo de 32 caracteres). Trocar ou perder esse segredo apenas encerra as sessões. Requisições que alteram estado só são aceitas de uma origem permitida. Dez tentativas de login de um mesmo endereço em 15 minutos bloqueiam esse endereço até o fim da janela (o contador fica em memória e zera ao reiniciar).
- **Esqueceu a senha:** execute `pnpm auth:reset` para ver a conta e `pnpm auth:reset --yes` para remover a conta e todas as sessões (com Compose: `docker compose exec backend node scripts/auth-reset.mjs --yes`). Abra o Homora para criar uma nova conta; cards e conexões cifradas são mantidos. Até a primeira conta ser criada, qualquer pessoa que alcance a interface por uma origem permitida pode reivindicá-la; faça isso em rede privada.
- **Rotação de segredos de conexões:** a rotação da própria chave de cifragem não é suportada, e remover `<banco>.key` com conexões cifradas as torna ilegíveis (o Homora não cria uma chave nova por cima delas). Na prática, crie um novo token na origem (Proxmox, Home Assistant etc.), informe-o de novo na conexão em Integrações e então revogue o token antigo. Tokens de agentes podem ser trocados na página Agentes ("Gerar novo token") ou revogados.
- Trate o banco, `.key` e os backups como um único conjunto secreto: quem tem a chave e o banco lê as credenciais guardadas.

## Descoberta Docker

Desativada por padrão. Sugere cards a partir de labels de contêineres em execução e não adiciona nada até você revisar e confirmar na página **Configurações**.

```yaml
services:
  jellyfin:
    labels:
      homora.url: http://192.168.1.10:8096
      homora.name: Jellyfin # opcional; padrão: nome do contêiner
      homora.group: Mídia # opcional; padrão: "Docker"
      homora.description: Filmes e séries # opcional
      homora.icon: brand:jellyfin # opcional
```

Os labels do Homepage (`homepage.href`, `homepage.name`, `homepage.group`, `homepage.description`, `homepage.icon`) também funcionam, e `homora.*` vence quando os dois existem. Labels nunca ativam o monitoramento de endereços privados; você escolhe isso nos cards que adicionar.

### Ativar a descoberta

O socket concede acesso privilegiado ao daemon; montá-lo como somente leitura não torna a API Docker somente leitura. Use estas opções apenas em um host confiável. Mantenha o proxy em rede privada confiável, sem porta publicada: quem o alcança pode ler metadados e labels dos contêineres e exportar seus sistemas de arquivos (`GET /containers/{id}/export`), o que pode expor dados da aplicação. Trate o acesso a ele como privilegiado.

**Docker Compose:** inicie o proxy restrito com o override:

```bash
docker compose -f compose.yml -f compose.docker-discovery.yml up -d --build
```

O proxy `tecnativa/docker-socket-proxy` permite endpoints GET de contêineres, bloqueia escritas e não publica porta. O backend recebe `HOMORA_DOCKER_HOST=http://docker-proxy:2375`.

**Coolify ou PaaS que lê um único Compose:** a plataforma não combina o override acima. No host Docker que executa o backend:

1. Identifique a rede Docker efetivamente ligada ao backend, por exemplo com `docker network ls` e `docker inspect <contêiner-backend>`. Substitua `<rede-do-projeto>` pela rede encontrada (frequentemente o UUID do app; confirme antes).
2. Inicie o proxy nessa rede, com a mesma imagem fixada pelo override:

   ```bash
   docker run -d --name homora-docker-proxy --restart unless-stopped \
     --network <rede-do-projeto> --network-alias docker-proxy \
     -e CONTAINERS=1 -e POST=0 \
     -v /var/run/docker.sock:/var/run/docker.sock:ro \
     tecnativa/docker-socket-proxy:0.3.0@sha256:9e4b9e7517a6b660f2cc903a19b257b1852d5b3344794e3ea334ff00ae677ac2
   ```

3. Configure `HOMORA_DOCKER_HOST=http://docker-proxy:2375` como variável de ambiente de execução do serviço **backend** na plataforma e faça o redeploy. Se a plataforma apenas fornecer variáveis de interpolação do Compose, adicione `HOMORA_DOCKER_HOST: ${HOMORA_DOCKER_HOST}` em `environment` do serviço backend na definição Compose única. Confira novamente a rede e o alias se ela for recriada.
4. Verifique conforme abaixo. O proxy é gerenciado fora da stack: sua manutenção e atualização são manuais, assim como sua reconexão se a plataforma substituir a rede.

**Socket Unix direto:** fora da configuração Compose fornecida, use `HOMORA_DOCKER_HOST=unix:///var/run/docker.sock` se o processo backend puder acessar o socket. Isso concede acesso privilegiado direto ao daemon; prefira o proxy restrito. Os arquivos Compose fornecidos não montam o socket no backend.

Um proxy próprio deve permitir `GET /containers/json` e retornar HTTP 200 com um array JSON. O Homora usa timeout de 5 segundos, aceita até 4 MiB por resposta e processa apenas os primeiros 1.000 contêineres. A conexão HTTP com o proxy não é cifrada; mantenha-a em rede privada confiável. A ACL de GET de contêineres do proxy é mais ampla que esse endpoint.

### Verificar e solucionar problemas

Em **Configurações**, a seção de descoberta Docker mostra a quantidade de contêineres em execução lidos após uma consulta bem-sucedida, mesmo sem sugestões. No MCP, `get_homora_capabilities` informa `discoveryEnabled: true` quando configurado; `list_discovery_suggestions` (exige `discovery:read`) consulta de fato e retorna `enabled` e `scanned`. Em stdio, configure `HOMORA_DOCKER_HOST` no próprio processo MCP; em HTTP, vale a configuração do backend. A configuração, por si só, não comprova que o proxy está acessível.

A descoberta consulta apenas contêineres em execução de um único daemon configurado. É sob demanda, não faz varredura periódica nem atualiza cards automaticamente, e exige revisão e confirmação antes de adicioná-los. Labels e nomes são dados não confiáveis; labels sozinhos nunca autorizam o monitoramento de endereços privados.

| Sintoma                   | Verificação e correção                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nenhuma sugestão          | Confira se há contêiner em execução nesse daemon com label `homora.url` ou `homepage.href` válido; revise os avisos de validação.                                                                   |
| `discovery-disabled`      | Configure `HOMORA_DOCKER_HOST` no ambiente de execução do backend (ou do MCP stdio) e reinicie o processo.                                                                                          |
| `docker-unavailable`      | Confira se o proxy está ativo, acessível na rede do backend e permite `GET /containers/json`; confira o acesso ao socket e o daemon. Respostas diferentes de 200 e timeout também causam esse erro. |
| `docker-invalid-response` | Confira se o proxy retorna um array JSON de até 4 MiB; reduza metadados ou labels se necessário.                                                                                                    |

A interface mostra mensagens amigáveis para esses erros; o MCP pode retornar uma falha genérica na consulta.

## Primeiro acesso e Proxmox

No primeiro acesso, crie a conta de administrador com nome, e-mail e uma senha de pelo menos 8 caracteres; o e-mail é só o seu nome de login, o Homora não envia e-mails. A sessão fica no banco e expira em oito horas. Em Integrações, crie uma conexão Proxmox nomeada para cada cluster ou servidor independente, usando uma conta e token com acesso somente leitura. A faixa superior permite escolher uma conexão em Configurações. Não compartilhe o token nem use uma conta com privilégios administrativos desnecessários. Os dados da integração são cifrados em repouso, com uma chave armazenada separadamente no mesmo diretório; isso não protege contra quem tenha acesso aos dois arquivos.

Para um Proxmox com CA privada, importe no formulário o certificado público da CA em formato PEM, obtido por um canal confiável. Na configuração padrão do Proxmox, ele fica em `/etc/pve/pve-root-ca.pem`; nunca importe a chave privada. A URL deve corresponder a um nome ou IP presente no certificado do servidor. Salve a conexão e use **Testar** na lista; ao editar, deixe o ID e o segredo do token em branco para mantê-los. O certificado é armazenado junto à configuração cifrada e precisa dos mesmos arquivos de backup. A validação TLS permanece ativa. Como alternativa, uma CA pode ser disponibilizada ao processo Node por `NODE_EXTRA_CA_CERTS` antes da inicialização.

## MCP e agentes de IA

O Homora oferece MCP local via stdio e Streamable HTTP sem sessão. Na página **Agentes**, crie um agente e use **Conectar** para obter os dados. Para HTTP, configure a URL `http://localhost:8080/mcp` (em desenvolvimento, `http://localhost:5173/mcp`) e o cabeçalho `Authorization: Bearer <token-do-agente>`. O token e seus escopos são verificados em cada requisição; revogação e rotação têm efeito imediato. Para acesso de outra máquina, use o proxy HTTPS de rede privada documentado e configure sua origem em `HOMORA_ALLOWED_ORIGINS`. Não exponha o Homora à internet pública. Proteja o token como uma senha. Os dois transportes mantêm as mesmas permissões e revisão humana das propostas.

Após `pnpm build`, configure um cliente MCP confiável para executar `node /caminho/absoluto/homora/apps/backend/dist/mcp-server.js` via stdio. Crie uma identidade na página **Agentes** e passe o token exibido uma vez em `HOMORA_AGENT_TOKEN`. Configure `HOMORA_DATABASE_PATH` com o **mesmo caminho absoluto do banco** usado pelo Homora; `pnpm dev` usa `data/homora-dev.sqlite`, enquanto o padrão normal é `data/homora.sqlite`. O processo precisa ler o arquivo `.key` e, se a configuração Proxmox antiga ainda não tiver sido migrada, o arquivo `.proxmox` desse caminho. Com Docker, o processo precisa acessar o mesmo volume; um banco diferente no host é outra instância.

| Escopo                                     | Ferramentas                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `services:read`                            | `list_services`, `get_service`, `list_groups`, `list_service_status`                       |
| `proxmox:read`                             | `list_proxmox_resources`                                                                   |
| `proposals:create`                         | `propose_service_card`, `propose_card_order`                                               |
| `groups:propose`                           | `propose_group_change`                                                                     |
| `widgets:read`, `widgets:propose`          | `list_widgets`, `propose_widget_change`, respectivamente                                   |
| `integrations:read`, `connections:propose` | `list_integrations`, `get_integration_status`; `propose_connection_setup`, respectivamente |
| `discovery:read`                           | `list_discovery_suggestions`; `propose_discovered_card` também exige `proposals:create`    |

`list_proxmox_resources` retorna dados agregados quando existe exatamente uma conexão Proxmox. Com várias, use `list_integrations` e `get_integration_status` com `integrations:read` para escolher a conexão.

`get_homora_capabilities` informa os escopos e as ferramentas disponíveis ao token. Qualquer escopo de proposta permite `list_proposals` e `get_proposal` para as próprias propostas. Propostas de cards, grupos, ordem e widgets expiram em 15 minutos e exigem aprovação humana autenticada; são recusadas se a configuração relevante mudar. Aprovar uma sugestão de conexão **não cria a conexão**: abra o formulário pela proposta aprovada e informe credenciais, permissão de rede privada e CA pessoalmente. O agente não fornece credenciais. A consulta de dados de integração faz requisição de leitura usando a política de destinos configurada. Para descoberta Docker, configure `HOMORA_DOCKER_HOST` no backend para HTTP e também no processo MCP para stdio, preferencialmente para o mesmo proxy restrito de leitura; ela vem desativada.

O monitor web compartilha suas últimas observações com o MCP via SQLite. Alterar a configuração do serviço invalida o resultado anterior; observações antigas são apresentadas como desconhecidas, com `stale: true`. Ao iniciar, o backend limpa observações antigas. Queries e fragmentos de URLs são omitidos nas consultas de serviços, integrações e descoberta e nas sugestões de cards descobertos. Nomes, labels e dados externos são dados não confiáveis, não instruções.

O processo MCP stdio acessa banco e cofre diretamente. Nenhum dos transportes é protegido pela sessão web. Use cliente e usuário do sistema confiáveis, proteja o token e conceda os menores escopos. Não há ações de infraestrutura nem escritas em integrações.

## Cenários de implantação

| Cenário                                   | Como                                                                                                                                                   | Situação                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Somente esta máquina                      | `docker compose up -d --build`; a porta fica em `127.0.0.1`.                                                                                           | Padrão e o mais testado.                                        |
| Rede privada, HTTP puro                   | Não suportado de propósito: só `localhost` pode usar HTTP, então alterações feitas de outras máquinas por HTTP são recusadas pela validação de origem. | Use o proxy HTTPS abaixo.                                       |
| Proxy reverso HTTPS na mesma rede privada | Veja abaixo.                                                                                                                                           | Validado uma vez com um nginx local e certificado autoassinado. |
| Internet pública                          | Não suportado.                                                                                                                                         | Não faça isso.                                                  |

Com um proxy reverso que encerra o HTTPS na frente do Homora:

1. Mantenha a porta do Homora em rede privada e publique só o proxy. Não publique o backend (porta 3000); no Compose ele não é publicado.
2. Defina `HOMORA_ALLOWED_ORIGINS` com a origem pública, por exemplo `https://homora.example.home` (lista separada por vírgulas; só HTTPS, além de `localhost`).
3. Faça o proxy encaminhar o `Host` e enviar o endereço real do cliente em `X-Forwarded-For` (no nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`).
4. Defina `HOMORA_TRUSTED_PROXY` com o endereço ou a rede do proxy, por exemplo `172.18.0.0/16` para um proxy na rede do Compose. Assim o limite de login por cliente (10 tentativas de login por cliente em 15 minutos) distingue os clientes. Sem isso, todos os clientes atrás do proxy dividem um único contador, e as tentativas erradas de outra pessoa podem bloquear você.
5. Não desative a validação de origem. O cookie de sessão é `HttpOnly`, `SameSite=Strict` e recebe `Secure` quando o login vem de uma origem HTTPS.

`HOMORA_TRUST_PROXY=true` (já definido nos arquivos do Compose) faz o backend ler o endereço do cliente em `X-Forwarded-For`; use apenas se toda requisição chegar ao backend por um proxy que sobrescreve esse cabeçalho, como o nginx incluído.

## Docker Compose

Execute `docker compose up --build` (ou, com imagens publicadas, `HOMORA_VERSION=<versão> docker compose -f compose.release.yml up -d`) e abra <http://localhost:8080>. A porta é vinculada ao localhost por padrão e os dados persistem no volume `homora-data`. O endereço de bind vem de `HOMORA_BIND_IP`; altere (por exemplo `HOMORA_BIND_IP=0.0.0.0`) apenas atrás de um proxy reverso com HTTPS na mesma rede privada, conforme a nota de segurança. Para criar um backup, use um diretório novo e protegido no host, pois os comandos não devem sobrescrever backups anteriores. Com o backend em execução, faça a cópia consistente do banco para o volume e exporte-a:

```bash
mkdir -p backups/backup-2026-11-10
docker compose exec backend node scripts/backup.mjs /app/data/homora.sqlite /app/data/backup.sqlite
docker compose cp backend:/app/data/backup.sqlite backups/backup-2026-11-10/homora.sqlite
```

A integração Proxmox original usa os arquivos `.key` e `.proxmox` ao lado
do banco; as demais credenciais cifradas no banco também
precisam da `.key`. Exporte cada arquivo que existir, usando o mesmo diretório
de backup e o nome de destino mostrado:

```bash
docker compose cp backend:/app/data/homora.sqlite.key backups/backup-2026-11-10/homora.sqlite.key
docker compose cp backend:/app/data/homora.sqlite.proxmox backups/backup-2026-11-10/homora.sqlite.proxmox
```

O `.proxmox` é opcional em instalações que ainda não o criaram;
se o arquivo não existir, pule sua cópia. Guarde o conjunto em local protegido
e mantenha a chave `.key` tão protegida quanto o banco. O comando de backup não
sobrescreve um arquivo existente. Faça uma restauração de teste antes de
depender de um backup.

A interface e a API não estão preparadas para exposição pública: o Compose não fornece HTTPS e até a conta de administrador existir, qualquer pessoa que alcance a porta pode criá-la, então faça a configuração inicial a partir da própria máquina, antes de expor qualquer coisa. A CA privada do Proxmox também pode ser importada pela interface quando o Homora estiver no container.

# Plano de evolução do Homora

Este plano transforma a análise inicial do repositório em etapas de trabalho.
A prioridade é ter uma homepage útil e confiável para um homelab pessoal,
configurável pela interface e utilizável sem Proxmox ou agente de IA. A
integração com infraestrutura e a assistência por agentes podem diferenciá-la
à medida que o núcleo amadurecer.

Atualize os itens ao concluí-los, registrando resultados e decisões relevantes
no próprio repositório. Um item só deve ser marcado como concluído depois da
implementação e da validação indicadas; código existente não significa que o
fluxo completo já foi validado. As etapas podem ser divididas em tarefas menores.

> **Direção (2026-11-10):** o posicionamento frente ao Homepage e ao Dashy e as
> fases R0 a R4 estão em [estrategia.md](estrategia.md). Os itens P0 a P5 abaixo
> continuam sendo o registro de progresso; ao iniciar uma fase R, converta seus
> itens em tarefas aqui.

## P0 — Consolidar e validar a base

- [x] Revisar os arquivos modificados e não rastreados, preservando o trabalho
      existente e verificando se dados locais e segredos estão fora do Git.
- [x] Registrar uma primeira versão coerente no Git após a revisão.
- [x] Instalar as dependências em ambiente com acesso ao registro npm e executar
      `pnpm check` e `pnpm build`; registrar e corrigir falhas encontradas.
- [x] Validar uma instalação limpa e o fluxo local: primeiro acesso, cadastro,
      edição, exclusão, busca e persistência após reinicialização.
- [x] Subir o Docker Compose e validar inicialização, persistência e atualização
      preservando dados.
- [x] Testar backup e restauração completos, incluindo os arquivos de conta,
      chave e integração quando aplicável; documentar a proteção e a recuperação.
- [x] Registrar problemas encontrados, sua prioridade e limitações conhecidas.

**Conclusão:** instalação e fluxo principal reproduzíveis, verificações passando
e restauração comprovada em ambiente de teste.

## P1 — Fechar o núcleo da homepage

- [x] Definir e implementar grupos independentes e ordenação de grupos e cards,
      com migração dos serviços existentes.
- [x] Permitir configurar ícones e melhorar a apresentação dos cards.
- [x] Revisar busca, filtros, estados vazios e mensagens de erro.
- [ ] Validar uso em telas pequenas e com teclado, incluindo foco e diálogos.
- [x] Confirmar que o painel de serviços funciona sem Proxmox e sem MCP.

**Conclusão:** é possível organizar e usar o painel diariamente pela interface,
com dados preservados e sem depender de integrações opcionais.

## P2 — Acesso e segurança para o homelab

- [ ] Definir os cenários suportados: acesso local, rede privada e proxy reverso,
      incluindo configuração inicial, HTTPS e origens permitidas.
- [ ] Revisar sessões, cookies, proteção contra CSRF, limites de requisição e
      comportamento atrás de proxy para os cenários escolhidos; testar os limites.
- [ ] Avaliar armazenamento, permissões, rotação e recuperação de segredos e
      documentar o modelo de confiança e suas limitações.
- [ ] Definir política de destinos para integrações e monitoramento: autorização
      explícita de redes privadas, portas, DNS, redirecionamentos e limites.

**Conclusão:** modelo de acesso documentado e validado para os cenários
suportados; não anunciar exposição em rede antes dessa validação.

### Registro de segurança P2 (parcial)

- Cenário local documentado como padrão. Origens HTTPS adicionais podem ser
  declaradas em `HOMORA_ALLOWED_ORIGINS`; HTTP adicional é restrito a localhost.
  O cookie recebe `Secure` para login originado em HTTPS. A validação de origem
  segue obrigatória para métodos que alteram estado.
- Testes automatizados cobrem parsing de origens exatas, rejeição de caminhos,
  curingas e HTTP remoto, bloqueio de mutações sem origem permitida e cookies
  `Secure` em login/logout HTTPS; HTTP local permanece compatível. `pnpm check`
  passou com 104 testes Vitest e 2 testes Node; `pnpm build` e
  `git diff --check` também passaram na branch integrada.
- Revisão de código: sessão em memória de oito horas, cookie HttpOnly e
  SameSite=Strict, senha scrypt com salt aleatório, limite de tentativas de
  login por endereço visto pelo backend, corpo limitado e destinos de integração
  com origem/porta exatas, DNS fixado, redirecionamentos recusados, TLS validado,
  timeout e limite de resposta. Arquivos de credenciais são cifrados e criados
  com permissões restritas. Não há rotação da chave; banco e backups precisam
  de proteção pelo sistema operacional.
- Pendências para concluir P2: validar proxy reverso HTTPS real e sua política
  de cabeçalhos/rede, testar limites de autenticação e sessões sob carga,
  revisar/completar faixas especiais de rede e demonstrar recuperação/rotação
  de segredos. A política atual não limita uma lista independente de portas: a
  porta autorizada é a porta exata na origem configurada por conexão.
- Não considerar acesso à rede privada ou exposição pública validada; Compose
  permanece publicado apenas em loopback e a integração precisa de validação
  adicional no ambiente do usuário.

## P3 — Disponibilidade e Proxmox

- [x] Implementar verificações periódicas com limites, timeout, cache e política
      de destinos definida em P2.
- [x] Mostrar estado desconhecido ou indisponível e horário da última tentativa,
      sem impedir o carregamento do restante do painel.
- [ ] Validar Proxmox em ambiente real com token de leitura e TLS confiável,
      incluindo falhas de conexão, certificado e permissões.
- [ ] Apresentar inventário útil e avaliar sugestões de cards revisáveis, sem
      alterar a infraestrutura automaticamente.

**Conclusão:** falhas de serviços e integrações são claras e isoladas, e o
inventário Proxmox foi validado com permissões reduzidas.

**Evidência parcial do monitoramento:** verificações de serviços são agendadas
a cada 60 segundos, limitadas (na época) a 25 serviços por ciclo e cinco consultas
simultâneas; cada consulta tem timeout total de 8 segundos, fixa o IP DNS e
rejeita redirecionamentos. Observações ficam em cache por 60 segundos e são
invalidadas ao criar, editar ou remover um serviço. RFC1918 e ULA são negadas
por padrão e podem ser autorizadas por serviço na interface autenticada. A
migração aditiva preserva serviços existentes e define a opção como desativada.
Faixas especiais e respostas DNS mistas continuam bloqueadas, incluindo
endereços IPv4 mapeados em IPv6; a origem e a porta exatas vêm da URL
configurada. O estado fica em memória e começa como desconhecido após reiniciar
o backend. Testes cobrem política de rede, monitoramento, API, migração e
interface; `pnpm check`, `pnpm build` e `git diff --check` passaram nos
worktrees das tarefas. Não houve acesso a serviços externos nem a Proxmox real;
validação do inventário e das redes reais permanece pendente.

## P4 — MCP e alterações com aprovação

- [x] Definir identidade, escopos e revogação de agentes e alinhar o acesso MCP
      ao modelo de autorização. O MCP atual é local, acessa banco/cofre
      diretamente e não é protegido pela sessão web.
- [x] Disponibilizar consultas autorizadas sem expor segredos e tratar dados
      externos como não confiáveis.
- [x] Implementar propostas de alterações de cards com revisão humana, diff,
      expiração e aprovação vinculada à versão exata da proposta e da configuração.
- [x] Aplicar alterações de forma transacional e registrar aprovação, rejeição e
      falhas; testar escopos, concorrência entre conexões SQLite, repetição,
      expiração, auditoria e payloads hostis.
- [ ] Exercitar manualmente a revisão visual e validar concorrência sob carga e
      resistência a instruções maliciosas em respostas reais de ferramentas.
- [x] Manter ações de infraestrutura, como reiniciar VMs, fora desta etapa.

**Conclusão:** agentes só acessam o que foi autorizado e alterações propostas
são revisáveis e auditáveis antes de serem aplicadas.

**Registro de implementação (2026-11-10):** foram adicionadas tabelas para
identidades, propostas, versão de configuração e auditoria, além de uma tela
autenticada para revisar propostas de cards. A API permite emitir, rotacionar e
revogar tokens com escopos explícitos; o MCP exige token para consultas de
serviços/Proxmox e usa `proposals:create` para propor cards. Aprovação/rejeição
ocorre sob transação SQLite, verifica hash e versão base, expiração e estado
pendente, e registra resultados sem incluir payloads de credenciais. Há testes
de escopo, rotação/revogação, stale state, repetição com duas conexões SQLite,
expiração, auditoria e campos hostis. A revisão independente encontrou um diff
que não refletia posição/permissão aplicada e uma gravação de proposta sem
atomicidade com auditoria; ambos foram corrigidos para persistir os valores
exatos aprovados e gravar proposta/auditoria juntos.

Esta etapa permanece **incompleta**: o fluxo visual não foi exercitado
manualmente; os testes cobrem concorrência entre conexões SQLite, mas não carga
nem injeção de instruções em respostas de ferramentas reais. Nenhuma
infraestrutura foi acessada.

### Consolidação arquitetural (2026-11-10)

- Regras de cards e grupos foram concentradas em
  `apps/backend/src/service-configuration.ts`, compartilhadas pelas rotas HTTP,
  MCP e aprovação de propostas. Alterações e versão da configuração passam pela
  mesma transação SQLite; nenhuma migração foi necessária.
- `app.ts` passou a compor rotas separadas por capacidade: autenticação,
  configuração, propostas/agentes, Proxmox e conexões. Schemas Zod validam
  corpos, parâmetros e queries HTTP; mensagens de erro não refletem dados
  recebidos.
- Regras de credenciais, persistência, cache e execução de conexões foram
  concentradas em `integration-connections.ts`; `routes/connections.ts` traduz
  entradas e resultados HTTP.
- `integration-registry.ts` agora registra metadados e execução dos cinco
  adaptadores. Conexões e consultas MCP resolvem os adaptadores pelo mesmo
  registro; Proxmox continua com armazenamento de credenciais legado e política
  de transporte própria.
- `pnpm check` passou: ESLint, Prettier, tipos, 119 testes Vitest e 2 testes
  Node. `pnpm build` também passou. Os fluxos externos reais e a validação
  manual da interface continuam fora da suíte local.

## P5 — Preparar publicação open source

- [x] Escolher licença e revisar licenças e atribuições das dependências e assets.
      MIT escolhida (2026-11-10); dependências de produção e fontes revisadas em
      `THIRD_PARTY_NOTICES.md`. Assets futuros e a imagem Docker exigem nova revisão.
- [ ] Verificar disponibilidade do nome e possíveis conflitos de marca.
- [x] Criar orientação inicial de contribuição e relato privado de
      vulnerabilidades, incluindo limitações e o estado de desenvolvimento.
- [x] Revisar e documentar os caminhos atuais de instalação, atualização,
      backup e recuperação no README; upgrade entre versões e restauração
      completa ainda não foram validados nesta etapa.
- [ ] Demonstrar instalação limpa e upgrade preservando dados antes de publicar
      uma release.
- [ ] Validar os critérios do MVP com uso real e decidir o escopo da primeira
      versão pública. Avaliar instalador para Proxmox depois de releases confiáveis.

**Conclusão:** outra pessoa consegue entender, instalar, atualizar e contribuir
com o projeto usando a documentação disponível.

## Revisão inicial de prontidão P5

- Foram criados `CONTRIBUTING.md` e `SECURITY.md`. O README agora documenta
  instalação com lockfile congelado e sequência de atualização/recuperação,
  deixando explícito que upgrade entre versões ainda não foi comprovado.
- A inspeção encontrou CI em `.github/workflows/ci.yml`, executada em push e
  pull request, com instalação congelada, `pnpm check` e `pnpm build`. O
  `packageManager` fixa pnpm 12.4.2, mas `.nvmrc` fixa apenas a linha Node 24;
  Docker também usa tags mutáveis (`node:24` e `nginx:1.27-alpine`). Portanto,
  há builds repetíveis por lockfile, mas não uma cadeia totalmente imutável ou
  uma release reproduzível.
- Não há workflow de release, licença nem metadados de publicação; o pacote
  raiz declara `private: true`. Nada foi publicado nesta revisão. A escolha da
  licença e a revisão de atribuições continuam pendentes; nenhuma licença foi
  adicionada.
- Validação documental: `git diff --check` passou nos worktrees de P5. Um
  deles não conseguiu executar `pnpm check`/`pnpm build` porque Corepack falhou
  ao consultar pnpm (shebang CRLF); a integração final será validada neste
  ambiente. O CI não constrói o Compose. A inspeção do teste de restauração
  existente mostra que ele usa tabelas sintéticas e não inicia o backend após
  restaurar. Upgrade e restauração operacional seguem pendentes.

## R0 — Adoção sem atrito (tarefas)

Origem: [estrategia.md](estrategia.md), fase R0. Nenhum item iniciado.
Marque apenas com a implementação e a validação indicadas.

- [ ] **Imagem Docker reproduzível:** fixar Node e nginx por versão/digest,
      construir amd64 e arm64 no CI e documentar o upgrade. Implementado e
      validado localmente (ver registro abaixo); **pendente** publicar uma
      release: o workflow nunca foi executado e `compose.release.yml` não foi
      testado contra imagens publicadas.
- [x] **Licença e atribuições** (também em P5): MIT, `LICENSE` e
      `THIRD_PARTY_NOTICES.md`. A imagem Docker deve incluir esses arquivos.
- [x] **Exportação e importação YAML/JSON** de serviços, grupos e ordem, com
      validação e relatório de itens ignorados; segredos nunca entram no arquivo.
      Validado por testes de ida e volta (ver registro abaixo); falta uma
      exportação/importação manual no navegador.
- [ ] **Importador do Homepage** (`services.yaml`, `bookmarks.yaml`) e do Dashy,
      com prévia revisável antes de gravar e limite às versões testadas.
      Implementado e testado com amostras derivadas da documentação oficial
      (ver registro abaixo); **pendente** validar com configurações reais, sem
      edição manual, que é o critério de conclusão do R0.
- [x] **Ícones por nome** de conjunto open source com licença compatível,
      mantendo emoji e URL própria (ver registro abaixo).
- [x] **Inglês e i18n:** interface em inglês por padrão, com pt-BR completo
      (feito, ver registro abaixo); README, instalação e capturas de tela em
      inglês (feito; `README.pt-BR.md` mantém o texto em português);
      a API devolve códigos de erro estáveis, traduzidos pela interface
      (feito, ver registro abaixo).

**Conclusão:** instalação limpa e importação de uma configuração real do
Homepage e do Dashy, sem edição manual, em ambiente de teste.

### Registro R0 — imagem Docker, README e capturas (2026-11-10)

- `Dockerfile`: Node e nginx fixados por digest (`node:24-bookworm-slim` e
  `nginx:1.27-alpine`), rótulos OCI, `HEALTHCHECK` nos dois alvos e, na imagem
  do frontend, a licença MIT, os avisos de terceiros e as licenças OFL das
  fontes em `/usr/share/doc/homora`. O Dependabot propõe atualizações dos
  digests e das actions.
- CI: novo job `docker` que constrói os dois alvos em cada PR (sem publicar).
  `release.yml`: ao receber uma tag `v*.*.*`, roda `pnpm check` e `pnpm build`
  e publica `homora-backend` e `homora-frontend` no GHCR para `linux/amd64` e
  `linux/arm64`, com proveniência e SBOM; as actions estão fixadas por SHA.
  `compose.release.yml` usa essas imagens (mesma porta em loopback).
- Validação local: build amd64 dos dois alvos e build arm64 (emulado, sem
  executar os contêineres) concluídos; os dois contêineres amd64 ficaram
  `healthy`. Upgrade: banco, conta e três serviços criados pela imagem do
  commit `cc3430b` foram lidos de forma idêntica pela imagem nova no mesmo
  volume, e a exportação funcionou sobre eles. Esta PR não adiciona migração,
  então o teste não exercita uma migração. Projeto, volume e rede de teste
  foram removidos.
- Navegador real (Chromium headless, dados fictícios, instância em contêiner):
  primeiro acesso em inglês, importação de arquivos dos três formatos pela
  prévia (Homora com permissão de rede privada, Homepage com avisos de ícone e
  widget e entrada inválida, Dashy com subitem e aviso de `pages`), reimportação
  sem duplicar, download da exportação sem IDs nem chaves, estado Disponível
  no monitor, troca para português sem novo login e celular de 390 px sem
  rolagem horizontal; sem erros de console. A revisão visual achou o texto do
  campo de busca cortado no celular (efeito do botão de idioma); corrigido com
  reticências.
- Documentação: `README.md` em inglês (instalação, upgrade, importação,
  backup, segurança, MCP) com capturas em `docs/screenshots`, e
  `README.pt-BR.md`.
- **Não atendido:** o critério de conclusão do R0 pede importar uma
  configuração real do Homepage e do Dashy sem edição manual; os testes usaram
  amostras derivadas da documentação. Também não foram feitos: publicar imagens
  e testar `compose.release.yml`, executar os contêineres arm64, revisão do
  inglês por um falante nativo e leitor de tela.

### Registro R0 — importadores do Homepage e do Dashy (2026-11-10)

- Formatos conferidos na documentação oficial em 2026-11-10 (Homepage:
  `configs/services` e `configs/bookmarks`; Dashy: `docs/configuring.md`), sem
  versão de software fixada. São a base dos testes; arquivos reais podem
  variar.
- `POST /api/config/import/{preview,apply}` aceitam `source`: `homora`
  (padrão), `homepage` ou `dashy`. Todos geram o mesmo documento intermediário
  e passam pela mesma prévia, relatório e transação do item anterior.
- Homepage: um único leitor para `services.yaml` e `bookmarks.yaml`; a entrada
  vira serviço ou bookmark conforme a forma. Grupos aninhados viram
  "Pai / Filho". `href` vira a URL; `description` e `icon` são mantidos quando
  possível. `siteMonitor`, `ping`, `widget(s)`, `server` e `container` não são
  importados (widgets geram aviso).
- Dashy: seções viram grupos; itens (`title`, `url`, `description`, `icon`)
  viram cards; `subItems` viram "Item / Sub". `pages` e widgets de seção geram
  aviso e não são lidos; `appConfig` e `pageInfo` são ignorados.
- Ícones: só são mantidos URL, emoji e nomes que coincidem com um dos 96 ícones
  embutidos (`mdi-server`, `fas fa-database` etc.). O restante (por exemplo
  `sonarr.png`; a R1 passou a mapeá-lo, ver "Registro R1 — logos de marca")
  fica vazio com aviso: não há busca em CDN
  de terceiros, para não revelar o IP de quem abre o painel nem depender de
  licença de marca. Esta é a maior perda de fidelidade da migração.
- Itens sem URL válida (incluindo `{{HOMEPAGE_VAR_*}}`) são relatados e
  ignorados. Cards importados de outro painel nunca recebem permissão de rede
  privada. Chaves e segredos de widgets não são lidos nem aparecem na prévia.
- Interface: seletor de formato na aba Configurações; trocar o formato refaz a
  prévia e a opção de manter a rede privada só aparece para arquivos do Homora.
- Validação: `pnpm check` (194 testes Vitest e 4 testes Node) e `pnpm build`
  passaram. Não verificados: configurações reais do Homepage e do Dashy,
  versões específicas dos dois projetos e o fluxo em navegador real.

### Registro R0 — exportação e importação (2026-11-10)

- Formato versionado (`version: 1`): `groups[].name` e `groups[].services[]` com
  `name`, `url` e, se houver, `description`, `icon` e `allowPrivate`. A ordem do
  arquivo é a ordem do painel. O arquivo não tem IDs, segredos, conexões nem
  widgets. JSON é lido pelo mesmo parser (YAML 1.2), com limite de 10 aliases,
  1 MB, 200 grupos e 1000 cards.
- API autenticada e protegida por origem: `GET /api/config/export?format=yaml|json`,
  `POST /api/config/import/preview` e `POST /api/config/import/apply`. A prévia
  não grava nada. A aplicação recalcula o plano dentro de uma transação SQLite e
  recusa (409) se a versão da configuração mudou depois da prévia.
- A importação só adiciona: não sobrescreve nem remove. Um card com a mesma URL
  no mesmo grupo é tratado como duplicado e ignorado; itens inválidos são
  ignorados e relatados por caminho (`groups[0].services[2]`) com um código
  estável que a interface traduz. Nenhuma mensagem em idioma sai do servidor.
- Decisão de segurança: `allowPrivate` do arquivo é ignorado, a menos que o
  usuário marque a opção na prévia, para que um arquivo de terceiros não
  autorize o monitor a alcançar a rede privada. A exportação inclui o valor.
- Interface: nova aba Configurações (exportar em YAML/JSON, escolher arquivo,
  prévia com novos/duplicados/ignorados e confirmação). O parser interno é
  reutilizável pelos importadores do Homepage e do Dashy.
- Nova dependência: `yaml` 2.9.1 (ISC) no backend.
- Validação: `pnpm check` e `pnpm build` passaram. Não verificados: o fluxo no
  navegador real e arquivos grandes ou malformados fora dos testes.

### Registro R0 — ícones por nome (2026-11-10)

- O campo `icon` aceita três formatos: emoji ou texto curto (até 8 caracteres,
  como antes), `lucide:nome` (96 ícones embutidos do Lucide, ISC, curados para
  homelab) e URL `http(s)` de imagem (até 512 caracteres, sem credenciais).
  `normalizeIcon` em `@homora/shared` valida no servidor; valores antigos
  continuam válidos e nenhuma migração foi necessária.
- A interface mostra uma prévia e sugere os nomes embutidos no formulário. Se o
  nome não existe ou a imagem não carrega, o card usa a inicial do serviço.
  Imagens por URL são carregadas pelo navegador, sem `referrer`.
- Limites: a lista é curada, não a biblioteca inteira; não há ícones de marcas
  (Jellyfin, Sonarr etc.), que precisarão de outro conjunto ou de URL própria,
  com licença revisada, quando os importadores forem feitos. Uma URL de imagem
  revela ao host da imagem o IP de quem abre o painel; agentes podem propor
  ícones por URL, e a proposta mostra o valor antes da aprovação.
- Validação: `pnpm check` (143 testes Vitest e 4 testes Node) e `pnpm build`
  passaram. Não verificado visualmente em navegador real.

### Registro R0 — i18n da interface (2026-11-10)

- `apps/frontend/src/i18n`: módulo próprio, sem dependência nova. Dicionários
  por domínio em `messages/` com `en` e `pt-BR` lado a lado; o tipo exige as
  mesmas chaves nas duas línguas. `t()` aceita `{marcadores}` e plural
  (`chave` e `chave_one`); datas e números usam `Intl` com o idioma atual.
- Idioma: escolha salva em `localStorage`; sem escolha, segue o navegador
  (português vira pt-BR) e o padrão é inglês. Há um seletor na barra lateral e
  no topo do celular. Trocar o idioma remonta a interface e preserva a sessão.
- Todas as telas migraram (shell, serviços, agentes, integrações, Proxmox e
  conexões). Os testes existentes fixam pt-BR em `test-setup.ts`; novos testes
  cobrem paridade de chaves e marcadores, plural, formatação, detecção e a
  troca de idioma na interface.
- Erros da API: toda resposta de erro tem `{ code, error }`, com `code`
  estável e `error` em inglês (catálogo em `apps/backend/src/api-error.ts`).
  Adaptadores, Proxmox e validação compartilhada lançam erros com `code`;
  falhas inesperadas viram um código genérico, sem detalhes internos. A
  interface traduz por `code` (`apiError`, chaves `apiError.*`) e usa `error`
  para códigos desconhecidos. Um teste garante tradução em inglês e pt-BR de
  todos os códigos do backend. Mudança de contrato: clientes que liam o texto
  em português de `error` passam a receber inglês; use `code`.
- Validação: `pnpm check` (195 testes Vitest e 4 testes Node) e `pnpm build`
  passaram. Não verificados: a interface em inglês em navegador real (largura,
  quebras de texto), leitor de tela e revisão do inglês por falante nativo.

## R1 — Home viva e estado honesto (tarefas)

Origem: [estrategia.md](estrategia.md), fase R1 e o caso de referência de
migração de um Homepage real. Nenhum item iniciado. Marque apenas com a
implementação e a validação indicadas. A ordem abaixo é a sugerida.

- [ ] **Widgets dentro do card:** cada card pode exibir dados de uma conexão
      existente, com estado de carregamento e de erro por widget. Implementado
      para Proxmox (VMs, LXC, CPU e memória), Jellyfin, Home Assistant, Uptime
      Kuma e AdGuard (ver registros abaixo); **pendente:** validação com
      instâncias reais.
- [x] **Ícones de marca por nome:** 163 logos do dashboard-icons (Apache-2.0)
      embutidos, registrados em `THIRD_PARTY_NOTICES.md`, mantendo `lucide:`,
      emoji e URL; importadores do Homepage e do Dashy mapeiam os nomes (ver
      registro abaixo). Cobertura limitada à lista curada.
- [x] **Estado semântico do monitor** (responde, exige login, não encontrado,
      sem resposta, não verificado), com código HTTP e latência, sem seguir
      redirecionamentos (ver registro abaixo).
- [x] **Limite de 25 serviços:** removido; o ciclo agora usa um orçamento de
      tempo com rodízio (ver registro abaixo).
- [x] **Colunas por grupo:** número de colunas (1 a 6) escolhido por grupo, além
      da grade automática e do modo compacto (ver registro abaixo). Cards com
      larguras livres dentro do grupo não foram feitos.
- [x] **Faixa superior opcional:** data, hora e recursos do sistema vindos de
      uma integração, sem agente no host (ver registro abaixo). Só há CPU,
      memória e disco do Proxmox; sem outra fonte de recursos por enquanto.
- [x] **Intervalo por serviço e ping ICMP,** com limites (ver registro abaixo).
- [x] **Descoberta Docker por labels,** com sugestões revisáveis e acesso
      somente leitura ao socket (ver registro abaixo). Opcional e desligada por
      padrão; é o item de maior risco.

**Conclusão:** a home responde "o que caiu?" sem abrir outra aba, nenhum card
parece monitorado sem ter sido verificado e a página de referência do
mantenedor pode ser reproduzida (ver o caso em estrategia.md).

### Registro R1 — widgets dentro do card (2026-11-10)

- Modelo: `integration_widgets.service_id` (migração `0006`, nulo, `ON DELETE
SET NULL`). Remover o card desliga o widget sem apagá-lo. A API aceita
  `serviceId` na criação e `PATCH /api/widgets/:id` com `{ serviceId }` (ou
  `null`); card inexistente responde `service-not-found`.
- Interface: o formulário de widget e cada widget em Integrações têm o seletor
  "Mostrar no card". O card mostra números em destaque; o modo compacto os
  oculta. A home consulta cada conexão uma vez por minuto, mesmo com vários
  widgets nela; falha da lista ou de uma conexão não afeta os cards.
- Validação: `pnpm check` e `pnpm build`; testes de API (ligar, trocar, desligar,
  card ou widget inexistente, remoção do card) e de interface (resumo por tipo,
  dados, falha isolada, lista indisponível). Navegador real (Chromium): servidor
  Uptime Kuma simulado em endereço de rede privada, dois widgets em cards
  diferentes, troca de card, dados exibidos ("3 up, 1 down"), conexão
  inacessível mostrando "Data unavailable" só no seu card, sem rolagem
  horizontal em 390 px. A política de destinos bloqueou 127.0.0.1 mesmo com
  rede privada permitida, como projetado.
- Não validado: instâncias reais de Jellyfin, Home Assistant, Uptime Kuma e
  AdGuard; atualização de uma base existente com widgets
  criados antes da migração (a coluna é nula por padrão e a migração só
  adiciona a coluna).

### Registro R1 — widget do Proxmox (2026-11-10)

- Modelo: o Proxmox segue no cofre legado (a extração é do R2). Uma linha ponte
  em `integration_instances` (tipo `proxmox`, sem segredo, criada ao ligar o
  primeiro widget) permite usar o mesmo mecanismo de widgets. Ela fica fora de
  `/api/connections` e responde 404 a edição, teste e remoção por lá. A API
  aceita `source: "proxmox"` em `POST /api/widgets` (exclusivo com
  `integrationId`) e responde `proxmox-not-configured` sem configuração.
- Dados: o card recebe só números agregados (VMs e LXC em execução/total, CPU
  ponderada por núcleos e memória dos nós online); modelos e nós offline são
  ignorados, e nomes, IDs e endereços não saem do backend por esse caminho. O
  cache é invalidado quando endereço, token, segredo ou CA mudam.
- Validação: `pnpm check` e `pnpm build`; testes do resumo (modelos, nós
  offline, itens inválidos, limites), da API (exclusividade, 404 sem
  configuração, linha ponte protegida, ausência de nomes, cache e invalidação) e
  da interface (opção "Proxmox" no formulário, corpo `source`, resumo). Navegador
  real (Chromium) com um servidor HTTPS simulado e CA própria, TLS validado: a
  opção Proxmox só aparece depois de configurar; o card mostrou "1 / 1 VMs,
  16 / 25 LXC, 6% CPU, 54% MEM" e a página não continha nomes de recursos.
- Não validado: um Proxmox real (clusters com vários nós, permissões
  restritas do token, modelos reais); a atualização de uma base com linha
  `proxmox` criada por versões anteriores.

### Registro R1 — logos de marca (2026-11-10)

- Escolha: 163 logos SVG do dashboard-icons (Apache-2.0; commit `d767d73`),
  copiados para `apps/frontend/public/brand-icons` e servidos pelo próprio Homora.
  Nada é buscado em CDN, então abrir o painel não revela o IP a terceiros. A
  lista é curada para homelab e self-hosting; só entraram SVG vetoriais (5 foram
  descartados por imagem embutida ou `foreignObject`). Ficaram de fora logos
  que só existem em PNG no projeto de origem (por exemplo Homepage, Dashy,
  Linkwarden e Speedtest Tracker).
- Formato: `brand:nome` (nomes da lista em `packages/shared/src/brand-icons.ts`;
  nomes fora da lista são descartados por `normalizeIcon`). A interface mostra
  o logo e volta à inicial se ele não carregar.
- Interface: o seletor de ícones lista os logos junto dos ícones embutidos, e o
  formulário oferece "Usar o logo de X" quando o nome do serviço coincide com um
  logo. O `pnpm dev` já cria os cards de exemplo com logos.
- Importadores: `sonarr.png`, `sh-plex`, `hl-jellyfin` e `si-docker` viram
  `brand:`; `mdi-` e `fa-` continuam indo para `lucide:`. Nomes sem equivalente
  ficam vazios com aviso, como antes.
- Validação: `pnpm check` e `pnpm build` (os 163 arquivos vão para o `dist`).
  Testes: lista e arquivos coincidem, SVG sem script/imagem/referência externa,
  sugestão por nome, `normalizeIcon`, importadores e o componente de ícone.
  Navegador real (Chromium): sugestão no formulário, busca "plex" no seletor,
  salvar com `brand:proxmox` e importar um `services.yaml` do Homepage com
  `sonarr.png`, `sh-plex` e `speedtest-tracker.png`; os logos carregaram
  (largura natural maior que zero), sem erro de console, e o ícone sem
  equivalente gerou aviso.
- Não validado: a imagem Docker com os novos arquivos e a licença copiada (o
  CI constrói a imagem); a aparência de cada logo sobre fundo escuro, já que
  alguns são pretos; revisão jurídica das marcas (apenas a licença do repositório
  e o aviso de marcas de terceiros foram considerados).

### Registro R1 — colunas por grupo (2026-11-10)

- Escopo: cada grupo pode fixar de 1 a 6 colunas em telas largas; sem escolha,
  vale a grade automática de antes. Em telas pequenas a grade continua em 1 ou
  2 colunas, para o painel seguir legível no celular. Não há cards com
  larguras diferentes dentro do mesmo grupo (o print de referência tem alguns
  grupos assim).
- Modelo: `service_groups.columns` (migração `0007`, nulo = automático).
  `PUT /api/groups/:id/columns` com `{ columns: 1..6 | null }`; valor inválido
  responde `invalid-columns`. Renomear ou reordenar grupos preserva o valor.
- Interface: no modo Organizar, cada grupo tem o seletor de colunas; a troca é
  otimista e volta atrás com mensagem se o servidor recusar.
- Exportação e importação: a exportação inclui `columns` só quando há valor.
  Na importação, o valor vale apenas para grupos novos (só adiciona, como no
  resto); valor inválido é ignorado com aviso `columns-ignored`.
- Validação: `pnpm check` e `pnpm build`; testes da API (definir, trocar,
  limpar, valores inválidos, grupo inexistente, renomear, exportar e importar),
  do componente (classes da grade, seletor só ao organizar) e dos textos nos dois
  idiomas. Navegador real (Chromium): 2 e 3 colunas em grupos diferentes, valor
  mantido ao mover o grupo e ao recarregar, presente na exportação, 1 coluna em
  390 px sem rolagem horizontal e o seletor em pt-BR.
- Não validado: uma base já em uso (a migração só adiciona uma coluna nula);
  6 colunas com cards longos em telas de 1280 px ou menos.

### Registro R1 — estado semântico do monitor (2026-11-10)

- Antes: só HTTP 2xx era "Disponível"; login (401/403), redirecionamento e 404
  viravam "Indisponível" sem explicação, e o card não dizia o que foi visto.
- Agora `/api/service-status` devolve, além de `status` e `lastAttempt`, um
  `reason`, o `httpStatus` e a `latencyMs`:

  | Resposta                         | `status`       | `reason`         | Etiqueta no card  |
  | -------------------------------- | -------------- | ---------------- | ----------------- |
  | 2xx                              | disponível     | `responding`     | Disponível        |
  | 3xx (não seguido)                | disponível     | `redirect`       | Redireciona       |
  | 401, 403                         | disponível     | `login-required` | Exige login       |
  | 404                              | indisponível   | `not-found`      | Não encontrado    |
  | outros 4xx, 5xx                  | indisponível   | `error-status`   | Resposta com erro |
  | falha de rede, DNS, TLS ou tempo | indisponível   | `no-response`    | Sem resposta      |
  | ainda não verificado             | sem informação | `unchecked`      | Não verificado    |

  O card mostra `HTTP <código> · <ms>` quando o motivo não é uma resposta 2xx.

- Decisão de produto: um serviço que responde pedindo login ou redirecionando
  está no ar, então não conta como queda. Isso muda o comportamento anterior,
  em que 3xx e 401/403 apareciam como indisponíveis. 404 continua como
  indisponível (o endereço cadastrado não leva a uma página).
- Redirecionamentos continuam sem ser seguidos. Só o monitor pede o código 3xx
  (`reportRedirect`); as integrações seguem rejeitando redirecionamentos.
- A latência mede da resolução do DNS até a resposta, em um único `GET`; não é
  uma medida de desempenho do serviço.
- Compatibilidade: a interface aceita respostas sem `reason`.
- O limite de 25 serviços por ciclo continuava nesta etapa (ver o registro do
  limite abaixo, que o removeu); os demais apareciam como "Não verificado".
- Validação: `pnpm check`; testes da classificação, do monitor (código, latência,
  sem resposta, não verificado), da requisição (3xx só quando pedido) e do card
  (rótulos e detalhe). Navegador real (Chromium) com servidor falso na rede
  local respondendo 200, 302, 401, 404 e 500, e uma porta fechada: cada card
  mostrou a etiqueta e o `HTTP` esperados, sem erros no console.
- Não validado: serviços reais (certificados, proxies que respondem 200 para
  tudo, 405 em `GET`), pt-BR no navegador (só em teste), a leitura por leitores
  de tela dos novos rótulos.

### Registro R1 — fim do limite de 25 serviços (2026-11-10)

- Antes: só os 25 primeiros serviços eram verificados por ciclo; os demais
  ficavam para sempre "sem informação", sem aviso.
- Agora não há limite de quantidade. Cada ciclo (a cada 60 s) ordena os serviços
  pelo horário da última tentativa (nunca verificados primeiro) e verifica cinco
  em paralelo, como antes. Ele para de **iniciar** verificações depois de 45 s;
  o que sobrar mantém o estado anterior e passa à frente no ciclo seguinte. Assim
  nenhum serviço fica de fora, e uma lista grande ou lenta só atrasa a
  atualização dos últimos, não os esconde.
- O estado anterior permanece visível enquanto o ciclo roda (antes, todos
  voltavam a "desconhecido" no início de cada ciclo). "Não verificado" agora só
  aparece para um serviço novo que ainda não foi alcançado.
- Cobertura: um serviço é atingido em um ciclo se houver orçamento; no pior caso
  (tudo expira em 8 s) cabem cerca de 28 verificações em 45 s, então com muitos
  serviços lentos a atualização leva mais de um ciclo. O horário da última
  tentativa mostra a idade do dado. Não há fila exposta na interface nem
  intervalo por serviço (próximo item).
- Validação: `pnpm check`; testes de 60 serviços verificados, orçamento esgotado
  com prioridade aos mais antigos no ciclo seguinte e estado anterior preservado
  durante o ciclo. Navegador real: 60 serviços criados pela API contra um
  servidor falso na rede local; todos receberam estado (nenhum "Não verificado").
- Não validado: centenas de serviços reais, impacto da carga na rede doméstica e
  o comportamento com muitos destinos lentos.

### Registro R1 — intervalo por serviço e ping ICMP (2026-11-10)

- Modelo: `services.check_type` (`http`, padrão, ou `ping`) e
  `services.check_interval` (segundos; nulo = 60) na migração `0008`. Limites:
  30 a 3600 s, validados na API (`400` fora disso) e novamente no servidor.
  Editar um card sem enviar os campos preserva os valores; `checkInterval: null`
  volta ao padrão. Agentes MCP podem propor os dois campos como qualquer outro,
  e uma proposta de edição sem eles os preserva.
- Monitor: o agendador acorda a cada 10 s e verifica só os serviços vencidos
  (tolerância de 2 s); cada serviço segue o próprio intervalo. O orçamento de
  45 s por ciclo e os cinco em paralelo do registro anterior continuam. Criar,
  editar ou remover um serviço continua reiniciando todas as verificações.
- Ping: usa o binário `ping` do sistema (um pacote `iputils-ping` agora está na
  imagem do backend), sem shell e só contra o IP que a política de destinos já
  autorizou e fixou (mesma regra de rede privada e de faixas especiais do HTTP).
  Uma resposta vira "Responde ao ping" (`reachable`, disponível) com a latência
  reportada pelo `ping`; sem resposta vira "Sem resposta". O ping só prova que o
  host responde: não diz nada sobre o serviço, e o formulário avisa isso.
- Sem o binário ou sem permissão (por exemplo, contêiner sem `NET_RAW`), o card
  fica "Não verificado" em vez de "Sem resposta", porque não é uma falha do
  serviço.
- Exportação e importação: `check: ping` e `interval: <s>` entram no arquivo só
  quando diferem do padrão; valores inválidos na importação são ignorados com o
  aviso `check-ignored`.
- Interface: o formulário do card ganhou "Método de verificação" e "Verificar a
  cada (segundos)". O card mostra `Ping · <ms>` para o ping.
- Validação: `pnpm check`; testes do agendamento por intervalo, do ping (IP
  autorizado, sem shell, latência, sem resposta, binário ausente ou sem
  permissão), da API (criar, preservar, limites, null, exportar e importar) e do
  formulário e do card. Contêiner da imagem nova (usuário `node`): ping a um host
  da rede local respondeu e a um endereço sem resposta falhou; com `NET_RAW`
  removido o ping é negado (tratado como "Não verificado"). Navegador real: card
  criado pelo formulário com ping e 30 s, outro inalcançável e um HTTP padrão;
  o de 30 s atualizou em ~36 s e o de 60 s não.
- Não validado: IPv6 e hostnames reais, redes com ICMP filtrado, Docker rootless
  ou Podman (o intervalo `ping_group_range` do sistema pode negar ICMP sem
  root), a imagem publicada e arm64. Latência abaixo de 1 ms aparece como 0 ms.

### Registro R1 — descoberta Docker por labels (2026-11-10)

- Escopo: a página Configurações lista contêineres em execução que têm os
  labels `homora.url` (ou `homepage.href`) e sugere um card para cada um. Nada é
  adicionado sem a pessoa marcar os contêineres e confirmar; a importação só
  adiciona e ignora o que já existe (mesma URL no mesmo grupo).
- Labels: `homora.url`, `homora.name`, `homora.group`, `homora.description` e
  `homora.icon`, mais os equivalentes `homepage.href`, `homepage.name`,
  `homepage.group`, `homepage.description` e `homepage.icon` para quem migra do
  Homepage (`homora.*` tem precedência). Sem nome, vale o nome do contêiner; sem
  grupo, "Docker". Ícones passam pelo mesmo mapeamento dos importadores.
- Acesso ao Docker, desenhado para o menor privilégio:
  - desligado por padrão; só existe se `HOMORA_DOCKER_HOST` estiver definido
    (`unix:///caminho/docker.sock` ou `http://host:porta`, sem credenciais,
    caminho ou HTTPS; valor inválido impede o backend de iniciar);
  - o backend faz uma única chamada, `GET /containers/json`, com timeout de 5 s,
    resposta limitada a 4 MB e no máximo 1000 contêineres;
  - o `compose.docker-discovery.yml` não entrega o socket ao Homora: um proxy
    (`tecnativa/docker-socket-proxy`, fixado por digest) segura o socket como
    somente leitura e só responde à listagem de contêineres (`CONTAINERS=1`,
    `POST=0`), sem porta publicada. Mesmo assim o socket dá acesso privilegiado
    ao daemon para esse proxy, então deve ser usado só em um host confiável.
- Segurança dos dados: labels e nomes são não confiáveis. As URLs passam pela
  mesma validação dos importadores (só http/https, sem credenciais); a interface
  nunca envia dados de cards, apenas IDs de contêineres, e o servidor relê o
  Docker na hora de importar. Labels **não** concedem monitoramento em rede
  privada: a caixa na revisão é uma escolha explícita e vale só para os cards
  adicionados naquele momento.
- API: `GET /api/discovery` (sugestões, plano e versão; `{ enabled: false }` se
  desligada) e `POST /api/discovery/import` (`ids`, `keepPrivate`,
  `expectedVersion`); erros `docker-unavailable`, `docker-invalid-response` e
  `discovery-disabled`.
- Também: `HOMORA_DOCKER_HOST` entrou em `globalPassThroughEnv` do Turborepo; sem
  isso o `pnpm dev` nunca repassava a variável ao backend.
- Validação: `pnpm check` e `pnpm build`; testes do endereço (aceitos e
  recusados), dos labels (precedência, `homepage.*`, URL insegura, ignorados),
  do cliente contra servidores reais por socket e por TCP (200, 403, JSON
  inválido, objeto, conexão recusada), das rotas (desligada, listar sem gravar,
  importar só os IDs escolhidos, duplicata, rede privada, versão antiga, erro do
  Docker) e da interface. Docker real (29.9): o proxy respondeu 200 à listagem e
  403 a imagens, `POST /containers/create` e exec; quatro contêineres de teste
  (dois com labels `homora.*` e `homepage.*`, um sem labels e um com
  `javascript:`) apareceram na interface só os dois válidos, foram adicionados
  com a caixa de rede privada, a segunda leitura os mostrou como já presentes e
  o monitor os verificou (200 e 302). O cliente também foi exercitado contra o
  socket Unix real.
- Compose completo: `docker compose -f compose.yml -f compose.docker-discovery.yml
up` subiu backend, frontend e proxy; no backend não existe
  `/var/run/docker.sock`, `HOMORA_DOCKER_HOST` apontava para o proxy, o proxy não
  publica porta e `GET /api/discovery` (pelo nginx, autenticado) devolveu o
  contêiner rotulado. Tudo foi removido depois (projeto, rede e imagens).
- Não validado: Docker Swarm, Podman e Docker rootless, contêineres em outros
  hosts, a versão arm64 do proxy, atualização automática de cards quando os labels mudam (a descoberta é
  sob demanda e não remove nem edita cards) e labels do Traefik ou do Dashy.

### Registro R1 — faixa superior (2026-11-10)

- Escopo: faixa opcional na página inicial com hora e data (relógio do
  navegador, no idioma escolhido) e o uso de CPU, memória e disco, vindos do
  widget do Proxmox. Não há agente no host: o dado é o que o Proxmox já
  informa sobre os nós online. Quem não tem Proxmox vê só o relógio.
- Ativação: caixa em Configurações, desligada por padrão. A preferência fica
  no `localStorage` do navegador (não vai para o servidor, nem para a
  exportação), então vale por navegador.
- Dados: o resumo do Proxmox ganhou `disk` (disco dos nós online, em %); a
  faixa usa o primeiro widget do tipo Proxmox, esteja ele ligado a um card ou
  não, e consulta uma vez por minuto. Se a consulta falha, mostra um aviso curto
  e o relógio continua. Respostas sem `disk` continuam aceitas.
- Fora do escopo: temperatura, rede, carga, uptime e a busca dentro da faixa (a
  busca segue no cabeçalho da página); fontes diferentes do Proxmox.
- Validação: `pnpm check`; testes do resumo (disco ponderado, nós offline
  ignorados, ausente = nulo), da faixa (dados, só relógio, falha) e do modelo.
  Navegador real (Chromium) com Proxmox falso por HTTPS e CA própria: faixa
  desligada por padrão, ativada em Configurações, hora e CPU 6%, Mem 54% e
  Disco 33%, preferência mantida ao recarregar e sem rolagem horizontal em 320,
  390 e 768 px.
- Não validado: Proxmox real (o disco de um nó é o sistema de arquivos raiz,
  não todos os armazenamentos); faixa em pt-BR no navegador (só no teste);
  vários nós com discos de tamanhos muito diferentes.

## Registro inicial

> **Histórico:** esta seção descreve a análise inicial. O estado atual está nas
> seções P0 a P5 e nas validações posteriores abaixo.

- Análise inicial: a base inclui CRUD de serviços, autenticação local, SQLite,
  Proxmox experimental, MCP local de leitura, testes e configuração de Compose.
- Na análise, boa parte da implementação estava não rastreada no Git. Verificar
  novamente antes de qualquer commit, pois o estado pode mudar.
- As verificações não foram concluídas na análise: as dependências não estavam
  instaladas e o ambiente não conseguiu acessar o registro npm. Não há, portanto,
  resultado confirmado de testes, build ou execução integrada.
- Comparação inicial: simplicidade e gestão de atalhos são expectativas básicas;
  integração com infraestrutura e assistência por agentes são oportunidades a
  validar. Consulte [produto](produto.md) e [arquitetura](arquitetura.md).

## Validação inicial da base

- Dependências instaladas com lockfile congelado; `pnpm check` e `pnpm build`
  passaram. A suíte inclui testes de backup com banco ativo e dados no WAL.
- Imagens Compose construídas e aplicação iniciada em projeto e volume isolados.
  Pela API, primeiro acesso, login, criação, edição, listagem, reinício com
  persistência e exclusão passaram. O volume temporário foi removido.
- A validação acima não cobre o fluxo visual completo no navegador, atualização
  entre versões ou restauração dos arquivos `.auth`, `.key` e `.proxmox`.
  Proxmox real também permanece pendente.
- Corrigidos tratamento de respostas Proxmox inválidas ou interrompidas,
  recuperação após falha no primeiro login, conflito da categoria “Todos” e
  apresentação de inventário antigo após falha de consulta.
- Arquivos de IDE foram incluídos no `.gitignore`. Dados e segredos nos caminhos
  locais padrão estão ignorados; caminhos personalizados devem ser protegidos
  separadamente. A revisão de arquivos e dados locais foi realizada antes do
  commit desta etapa.

## Entrega local — integrações experimentais

- Revisadas as dependências e atualizados MCP SDK, Fastify, Vitest e cobertura.
  `pnpm audit --prod` não encontrou vulnerabilidades conhecidas. `pnpm audit`
  ainda aponta duas moderadas de desenvolvimento: `minimatch` na árvore do
  ESLint e `esbuild` na cadeia interna legada do `drizzle-kit`; não foram usados
  overrides incompatíveis para mascará-las.
- A API autenticada oferece catálogo para Proxmox, Jellyfin, Home Assistant,
  Uptime Kuma e AdGuard Home, rotas de conexão e rotas básicas separadas para
  vínculos de widgets. A interface permite cadastrar, editar, testar, consultar
  e remover as quatro conexões novas; também permite criar, listar, consultar e
  remover widgets nomeados, incluindo vários widgets por conexão. Widgets ainda
  não podem ser editados nem têm configuração ou observação independentes.
- Jellyfin, Home Assistant, Uptime Kuma e AdGuard Home têm adaptadores somente
  de leitura. Segredos e CAs são cifrados usando a chave local; as respostas
  públicas não incluem seus valores. O backend aplica política comum de
  destino, fixação do IP DNS autorizado, TLS, rejeição de redirecionamentos,
  timeout e limite de resposta. O acesso a endereços privados é explícito por
  conexão. A lista de endereços especiais bloqueados não é exaustiva.
- Resultados são armazenados por 30 segundos em cache por conexão; edição e
  remoção invalidam o cache, consulta manual força atualização e erros não são
  armazenados como sucesso. Os widgets ainda não têm cache/observação próprios.
- Backup e restauração local cobrem credenciais cifradas no banco quando a mesma
  chave `.key` é restaurada junto aos arquivos de conta e credenciais legadas.
  Foi validado com dados sintéticos em arquivo temporário; não substitui um
  procedimento operacional de backup protegido.
- `pnpm check` passou (20 arquivos Vitest, 85 testes e 2 testes de scripts),
  assim como `pnpm build`, `git diff --check` e o teste TLS local, que rejeita
  CA desconhecida e aceita CA temporária confiável.
- Adaptadores e interface foram validados com mocks, não com Jellyfin, Home
  Assistant, Uptime Kuma ou AdGuard Home reais. Compatibilidade de versões,
  permissões e certificados precisa ser confirmada em ambientes de usuário.

## Trabalho prévio de integrações

> **Histórico:** o texto abaixo é anterior à "Entrega local — integrações
> experimentais". Jellyfin, Home Assistant, Uptime Kuma e AdGuard Home já têm
> adaptadores e interface (validados só com mocks), e a política de rede já
> protege os adaptadores; as lacunas descritas aqui foram em grande parte
> resolvidas.

- A análise e o plano técnico estão em [integrações](integracoes.md). A primeira
  versão do projeto foi registrada no Git e a conexão Proxmox com CA importada
  funcionou no ambiente do usuário; os demais cenários reais ainda exigem testes.
- O registro de adaptadores, catálogo autenticado, cache Proxmox e migração
  aditiva de instâncias e widgets são fundações iniciais. As novas tabelas ainda
  possuem API e interface de gerenciamento básicas; edição e configuração
  própria de widgets continuam pendentes. O cofre Proxmox antigo permanece em uso.
- Jellyfin e Home Assistant têm protótipos isolados com testes simulados, ainda
  indisponíveis na interface. Uptime Kuma e AdGuard Home foram pesquisados, mas
  ainda não foram implementados. Nenhum dos quatro foi validado em ambiente real.
- A política e o transporte de rede são experimentais e ainda não protegem os
  adaptadores existentes. Precisam de revisão de endereços especiais, integração
  e testes adicionais antes de expor destinos configuráveis.

## Redesenho da interface

- A interface foi redesenhada:
  começa pelo celular (navegação inferior, alvos de toque de 44 px), usa tema
  claro e escuro conforme o sistema (com alternância manual), paleta grafite e
  azul (substituída pela paleta quente descrita em “Refinamento da interface”), e fontes Hanken Grotesk e Bricolage Grotesque servidas localmente
  (SIL OFL 1.1, ver `apps/frontend/src/fonts/README.md`).
- O cadastro e a edição de serviços passaram a usar um formulário na própria
  página, em vez de diálogo modal. A remoção exige confirmação na própria linha.
  Serviços são agrupados por categoria; a busca também considera o endereço, e
  Enter abre o primeiro resultado (`Ctrl K` ou `/` focam a busca).
- O painel de integrações mostra o Proxmox (CPU e memória dos nós, lista de VMs
  e containers e data da última consulta) e o catálogo de integrações
  disponíveis, com o mesmo conteúdo e comportamento que já existiam. Os cartões “Monitoramento” e “Assistente”
  e o relógio foram removidos: eram apenas texto de recurso planejado.
- Não implementado, apenas previsto na proposta: estado e histórico de
  disponibilidade por serviço, sugestão de cards a partir do Proxmox e fila de
  propostas do agente. Dependem de monitoramento e do modelo de aprovação.
- Validação: `pnpm check` e `pnpm build` passaram. O fluxo foi exercitado em
  navegador headless (primeiro acesso, cadastro, confirmação de remoção,
  abas e formulário do Proxmox) com banco temporário, em 390 e 1440 px, sem
  erros no console nem rolagem horizontal. Não foram verificados: leitor de
  tela, navegação completa por teclado, aparelho móvel real e Proxmox real.
  Por isso os itens de telas pequenas e teclado do P1 seguem abertos.

## Migração para shadcn/ui e Tailwind v4 (nova identidade)

- `apps/frontend` passou a usar Tailwind CSS 4.3, shadcn/ui (CLI 4.23, base
  Radix) e lucide-react. O `style.css` de 1.539 linhas foi substituído por
  tokens semânticos; telas e módulos viraram componentes (`components/ui`,
  `components`, `pages`, `features`, `hooks`, `lib`). A skill `shadcn` foi
  instalada em `.agents/skills/shadcn` e registrada em `skills-lock.json`.
- Nova identidade, escolhida entre as opções do fluxo do Impeccable: “Etiqueta
  de patch panel” (grafite aquecido, fita de rotuladora branca, amarelo de fita
  só em ação e foco; Barlow Semi Condensed, Figtree e JetBrains Mono servidas
  localmente por pacotes Fontsource, SIL OFL). `PRODUCT.md` registra o tom
  caloroso; `DESIGN.md` descreve o sistema.
- Comportamento, textos, rotas de API e nomes acessíveis foram preservados; os
  testes existentes passam sem mudança de expectativa. A remoção de serviço
  continua com confirmação na própria linha.
- Validação: ver o resumo da entrega. Não verificados: leitor de tela, aparelho
  móvel real, Proxmox real e navegação completa por teclado.

## Refinamento da interface (crítica de design)

- Uma crítica da interface (nota 23/40 nas heurísticas de usabilidade) levou a
  mudanças em `apps/frontend`. `PRODUCT.md` e `DESIGN.md` (com
  `.impeccable/design.json`) agora registram usuários, princípios e o sistema
  visual; a paleta passou a neutros quentes com um acento âmbar, e as cores de
  estado seguem os tokens `--ok` e `--bad`.
- A tela de serviços separa uso de gestão: o botão “Organizar” liga criar,
  renomear, remover e ordenar grupos e mover cards (por arraste ou pelos botões
  ↑ e ↓). Os cards mostram descrição, endereço e disponibilidade; o estado usa
  texto e forma, não só cor, e a hora da última tentativa só aparece quando o
  serviço não está disponível. Salvar e remover confirmam em uma região de status.
- A aba Agentes virou o componente `Agents.tsx`: propostas em linguagem clara
  (operação e campos alterados), aprovação e rejeição, histórico, token exibido
  uma vez com botão de copiar, confirmação ao revogar e descrição das permissões.
  Nenhuma regra de autorização mudou; a API é a mesma.
- A navegação tem os mesmos três itens no desktop e no celular; removemos os
  rótulos pequenos acima de títulos e o blur do topo.
- Depois de uma crítica de design (25/40): serviços em rede privada sem
  autorização aparecem como “Monitoramento bloqueado” (com dica para autorizar
  em Editar) e não como “Indisponível”; o resumo da página separa no ar, fora do
  ar e sem monitoramento; o menu “⋯” dos cards ficou sempre visível; chips,
  botões pequenos e botões de mover passaram a 44 px no celular.
- Mesma crítica, itens seguintes: propostas pendentes ganham destaque e mostram
  antes e depois (campos alterados e quantos continuam iguais) com o nome do
  serviço; “Nova identidade” fica recolhida quando já existe uma; a remoção de
  conexões e widgets usa confirmação no próprio botão, no lugar de
  `window.confirm`; o modo Organizar mostra uma faixa explicando o que está
  ativo e esconde os filtros. Não há “Desfazer” após remover: a exclusão é
  imediata na API e seguir adiante exigiria exclusão adiada ou restauração.
- Validação: lint, tipos, build e os testes do frontend passaram; as telas
  foram vistas em navegador headless com banco temporário, em 390 e 1280 px, nos
  temas claro e escuro. Não foram verificados: arrastar cards com o mouse, leitor
  de tela, navegação completa por teclado, aparelho móvel real, contraste medido
  por ferramenta e a aba Agentes com propostas reais de um agente MCP.
  `pnpm check` completo passou depois de excluir do ESLint e do Prettier as
  pastas de skills de agentes (`.agent`, `.agents`, `.claude`, `.codex`,
  `.hermes`, `.github/skills`, `.github/agents` e `.impeccable`).

## Núcleo da homepage — fluxos implementados

- Migração aditiva cria grupos persistentes a partir das categorias existentes e
  inicializa a ordem dos cards por nome; os dados e IDs dos serviços são mantidos.
- A API e a interface permitem criar, renomear, excluir grupos vazios e ordenar
  grupos. Excluir grupos com cards é bloqueado; renomear preserva os cards.
- A ordenação individual dos cards é persistida dentro do grupo e a API rejeita
  listas incompletas, duplicadas ou com IDs fora do grupo. A criação de card
  adiciona-o ao fim e a edição mantém a posição existente.
- O formulário de serviço aceita emoji como ícone. Busca cobre nome, categoria,
  descrição e endereço; filtros e estados vazios permanecem visíveis. A tela de
  serviços foi testada com falhas nas integrações opcionais.
- O formulário é inline, não modal. Abrir formulário e renomear grupo move o
  foco ao campo; Escape fecha/cancela e devolve o foco ao controle de origem.
  Botões nomeados suportam ordenação de grupos e cards por teclado.
- Revisão independente apontou colisão de posição após exclusão e submissão
  ambígua durante renomeação; a criação de grupo fica oculta durante a edição e
  cards novos ou movidos recebem posição após o maior valor existente.
- `pnpm check` (95 testes Vitest e 4 testes de backup), `pnpm build` e
  `git diff --check` passaram.
- Permanece pendente validação manual com leitor de tela e aparelho móvel real.
  A conclusão completa do P1 depende dessa revisão de acessibilidade e uso real.

## Validação P0 — backup, restauração e migrações locais

- Em Node.js `v24.16.0` e pnpm `12.4.2`, a instalação congelada usou 417
  pacotes do cache local. Passaram os 4 testes de scripts de backup, os 4 testes
  de migração, `pnpm build` e `pnpm test` (20 arquivos, 88 testes Vitest mais 4
  testes Node). A execução inicial de `pnpm test` antes do build falhou porque
  `@homora/db` ainda não tinha os artefatos `dist`; build seguido de testes
  passou.
- A restauração de integração usa diretório temporário e dados fictícios; copia
  `.auth`, `.key` e `.proxmox` com o banco, restaura em outro caminho e confere
  login, configuração Proxmox e credenciais cifradas. Também cobre WAL,
  integridade, modo `0600`, recusa de sobrescrita e falha sem backup parcial.
  Os testes de migração usam bancos SQLite temporários e verificam adoção de
  esquema legado, migração aditiva, preservação de serviços e referências,
  reinicialização e esquemas incompatíveis.
- Validação Compose isolada: Docker Server 29.9.2 e Compose v5.6.1. A versão
  base `f66c3ef` e o Homora integrado em `04fb017` foram construídos e iniciados
  no projeto `homora-p0upg-4ab7d329`, volume descartável
  `homora-p0upg-4ab7d329_homora-data` e porta loopback 49381. Um serviço
  sintético criado pela API preservou ID 1, nome, URL e categoria após a
  atualização; posição 0, ícone vazio e `allowPrivate: false` também foram
  confirmados. Projeto e volume foram removidos ao final.
- Restauração operacional completa validada com backend real em containers
  temporários: o banco e os sidecars `.auth`, `.key` e `.proxmox` foram copiados
  para outro caminho. O backend restaurado autenticou a conta sintética, leu o
  serviço persistido e carregou/salvou novamente configuração Proxmox cifrada
  com chave e CA sintéticas, sem realizar conexão externa. Containers e
  diretório temporário foram removidos.
- Repetição final após P4, no commit `158a4ad`: upgrade da versão base
  `f66c3ef` para o branch integrado preservou o serviço sintético, incluindo
  `icon`, `position` e `allowPrivate: false`; foram confirmadas as seis
  migrações e as quatro tabelas novas de agentes/propostas/auditoria. A
  restauração em outro caminho autenticou, reconheceu a configuração Proxmox
  com CA e recarregou/salvou os dados cifrados sem chamadas de rede. O teste
  usou projeto/volume Compose, containers, imagens e portas loopback temporários;
  todos foram removidos ao final.
- Nenhum banco real, caminho `data/` ou serviço real foi acessado. Os relatórios
  e logs redigidos dessas execuções ficaram em `/tmp` e não foram adicionados ao
  repositório.

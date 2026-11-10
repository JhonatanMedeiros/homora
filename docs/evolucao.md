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
a cada 60 segundos, limitadas a 25 serviços por ciclo e cinco consultas
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
      construir amd64 e arm64 no CI e documentar o upgrade. Validar: build
      multi-arch e upgrade preservando dados.
- [x] **Licença e atribuições** (também em P5): MIT, `LICENSE` e
      `THIRD_PARTY_NOTICES.md`. A imagem Docker deve incluir esses arquivos.
- [ ] **Exportação e importação YAML/JSON** de serviços, grupos e ordem, com
      validação e relatório de itens ignorados; segredos nunca entram no arquivo.
      Validar: exportar, importar em banco limpo e comparar.
- [ ] **Importador do Homepage** (`services.yaml`, `bookmarks.yaml`) e do Dashy,
      com prévia revisável antes de gravar e limite às versões testadas.
      Validar com configurações reais, sem edição manual.
- [x] **Ícones por nome** de conjunto open source com licença compatível,
      mantendo emoji e URL própria (ver registro abaixo).
- [ ] **Inglês e i18n:** interface em inglês por padrão, com pt-BR completo
      (feito, ver registro abaixo); README, instalação e capturas de tela em
      inglês (pendente, junto da imagem Docker); mensagens de erro do backend
      ainda em português (pendente).

**Conclusão:** instalação limpa e importação de uma configuração real do
Homepage e do Dashy, sem edição manual, em ambiente de teste.

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
- Limitação: o backend ainda responde erros em português. A interface traduz
  as mensagens HTTP conhecidas por uma tabela (`i18n/api-errors.ts`); os erros
  dos adaptadores aparecem como recebidos. Próximo passo sugerido: a API
  devolver códigos de erro estáveis e a interface traduzi-los.
- Validação: `pnpm check` (126 testes Vitest e 4 testes Node) e `pnpm build`
  passaram. Não verificados: a interface em inglês em navegador real (largura,
  quebras de texto), leitor de tela e revisão do inglês por falante nativo.

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

- A interface foi refeita a partir da proposta `propostas/console-v2.html`:
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

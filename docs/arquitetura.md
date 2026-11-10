# Arquitetura do Homora

Homora segue um monólito modular: uma aplicação web, uma API Node e um banco
SQLite, distribuídos como um conjunto pequeno de processos/pacotes. Essa forma
mantém a instalação pessoal simples sem impedir que módulos sejam extraídos se
houver uma necessidade concreta.

A comparação de projetos e a direção para integrações estão em
[integrações](integracoes.md). O diagrama descreve a direção desejada. A seção
[implementação atual](#implementação-atual) registra diferenças importantes.

```mermaid
flowchart LR
  U[Usuário] --> UI[Interface web]
  A[Agente MCP] --> MCP[Servidor MCP]
  UI --> API[API de aplicação]
  MCP --> API
  API --> DB[(Banco local)]
  API --> INT[Adaptadores de integração]
  INT --> P[API Proxmox]
  INT --> S[Serviços cadastrados]
```

## Componentes e direção

- Interface web: painel, configuração, revisão de propostas e gestão dos agentes.
- API HTTP: autenticação da sessão web, validação, regras de aplicação e
  armazenamento. O módulo de configuração de cards é compartilhado com o MCP;
  outras rotas permanecem específicas ao HTTP.
- Adaptadores: validam configurações e coletam dados externos. O registro
  central expõe metadados e execução; cada integração mantém seu formato de
  credencial e limites específicos.
- MCP atual: processo local stdio com token e escopos, que abre banco e cofre
  diretamente. Oferece consultas e criação de propostas; não usa a sessão web,
  não grava cards sem aprovação humana e não retorna segredos.
- Persistência: SQLite, migrações e recuperação estão implementados. Credenciais
  de algumas integrações ficam cifradas no banco com chave lateral; Proxmox usa
  arquivo legado. Rotação automática e proteção contra comprometimento do host
  ainda não existem.

## Modelo inicial

Serviço (nome, URL, ícone, grupo), grupo (nome e ordem), integração (tipo, configuração e referência a segredo), observação (estado e data), proposta (autor, operações, versão da configuração, expiração e estado) e evento de auditoria (ator, ação, resultado e horário).

## Segurança

- Autenticação obrigatória para interface e MCP; identidades separadas para agentes, permissões mínimas e revogação. Não presumir que rede local é confiável.
- O MCP pode consultar e criar propostas; alteração persistente de cards ocorre
  após revisão humana autenticada da proposta exata. Propostas obsoletas,
  expiradas ou já aplicadas são rejeitadas. Não permitir autoaprovação pelo
  agente nem escrita direta em integrações.
- Proxmox com token restrito e TLS validado; orientar a instalação de certificados confiáveis. Não aceitar credenciais em prompts ou retorná-las em ferramentas.
- Evitar SSRF: verificar destinos e redirecionamentos no servidor, restringir redes e portas configuradas pelo administrador, bloquear destinos sensíveis e revalidar DNS na conexão. O acesso à rede privada deve ser autorizado explicitamente, pois é necessário ao homelab.
- A implantação atualmente suportada por padrão é local em loopback. Origens adicionais são configuradas explicitamente em `HOMORA_ALLOWED_ORIGINS`; origens HTTP só são aceitas em localhost. Para proxy reverso, o proxy deve terminar HTTPS e isolar a API. A aplicação não confia em `X-Forwarded-For`/`X-Forwarded-Proto`; portanto não configure proxies não confiáveis nem use cabeçalhos encaminhados para decidir identidade ou segurança.
- A política de destinos de integrações e do monitoramento exige origem exata, com protocolo e porta incluídos na URL configurada, resolve DNS uma vez, fixa o IP autorizado, rejeita respostas DNS mistas e redirecionamentos, usa TLS validado e impõe timeout e limite de resposta. RFC1918 e ULA são bloqueadas por padrão; conexões de integração precisam de opt-in por conexão e o monitoramento precisa de opt-in por serviço. Faixas especiais são bloqueadas mesmo com essa permissão. A lista de faixas especiais não é uma garantia de cobertura de toda rede ou política local.
- A senha local é derivada com scrypt e salt aleatório; sessões aleatórias são mantidas somente em memória por oito horas e invalidadas ao reiniciar. Cookies usam HttpOnly e SameSite=Strict; a sessão emitida por origem HTTPS também usa Secure. Operações que alteram estado exigem uma origem explicitamente permitida. Limite de login é em memória e baseado no endereço que o backend vê; atrás de proxy, isso pode agrupar usuários no endereço do proxy.
- Credenciais de integração são cifradas com AES-256-GCM e chave aleatória em arquivo separado. `.auth`, `.key` e `.proxmox` são criados com modo 0600; a recuperação exige preservar os arquivos correspondentes e protegê-los juntos. Não há rotação automática da chave nem proteção contra comprometimento do host, processo ou cópia conjunta da chave e dados. Proteja também o arquivo SQLite, backups e volume persistente com permissões do sistema operacional.
- Segredos fora de logs, backup e auditoria por padrão; logs com retenção configurável. Backups criptografados quando incluírem segredos.
- Proteção contra CSRF, sessões seguras, limites de requisição e validação de entrada; não executar comandos arbitrários ou scripts recebidos de agentes.
- Conteúdo obtido de serviços é dado não confiável: nunca interpretá-lo como instrução para o agente. Testar injeção de prompt e falhas de autorização.

## Implantação e escolhas pendentes

React, TypeScript, Node.js, SQLite e Docker Compose já são escolhas
implementadas. Compose usa volume persistente e publicação local em loopback.
Upgrade e recuperação têm instruções e validações documentadas, mas releases e
exposição em rede continuam sem perfil operacional validado. Um script
Community Scripts pode ser estudado após haver releases confiáveis.

## Implementação atual

- `apps/frontend` contém a interface React/Vite. `apps/backend` contém a API
  Fastify, o processo MCP stdio, autenticação, integrações, política de rede e
  serviços de domínio. `packages/shared` publica validação/contratos TypeScript;
  `packages/db` contém esquema, inicialização e migrações Drizzle/SQLite.
- `app.ts` compõe hooks globais, autenticação e módulos de rota. As rotas de
  autenticação, configuração de cards/grupos, agentes/propostas e Proxmox ficam
  em `routes/`; conexões seguem em `connections.ts`. O módulo
  `service-configuration.ts` centraliza invariantes de cards/grupos, transações
  e versão da configuração para HTTP, MCP e aprovação de propostas. O frontend
  ainda concentra a composição principal em `App.tsx` e a gestão de conexões em
  `Connections.tsx`.
- `integration-registry.ts` registra metadados e execução dos adaptadores
  Jellyfin, Home Assistant, Uptime Kuma, AdGuard Home e Proxmox. As quatro
  conexões novas usam o transporte com política de destino; Proxmox usa seu
  cofre legado e transporte próprio, mas aparece no mesmo catálogo e registro
  de execução.
- O MCP executa em processo separado e abre SQLite/cofre diretamente. Ele
  autentica tokens de agente com escopos; oferece consultas e criação de
  propostas. Ele não passa pela API HTTP nem pela sessão web. Essa fronteira é
  intencional por enquanto e precisa ser considerada ao alterar autorização.
- SQLite é fonte persistente. Atualizações de esquema são migrações versionadas;
  estado de sessão e alguns caches de observação são mantidos em memória.

## Avaliação e prioridades arquiteturais

A base é coerente para produto inicial: limites entre frontend, backend e
pacotes compartilhados estão estabelecidos, as integrações externas ficam no
backend, o banco tem migrações e há testes unitários/de integração. TypeScript
estrito, pnpm workspaces, Turborepo, ESLint, Prettier, Vitest e CI dão uma
fundação de consistência. A arquitetura não precisa de microserviços ou de uma
camada genérica adicional agora.

Os principais pontos de atenção são evolução e consistência, não a escolha de
tecnologia:

1. `service-configuration.ts` já reúne regras de configuração de cards e grupos,
   inclusive a versão usada por propostas. Parte da validação HTTP ainda usa
   casts manuais; schemas Zod nos limites HTTP/MCP reduziriam divergências e
   respostas 500 acidentais.
2. Algumas operações de conexão ainda combinam validação, cofre, persistência,
   cache e tradução de erros em `connections.ts`. Extraia lógica adicional
   quando uma regra for compartilhada ou a mudança precisar de menor localidade;
   evite arquivos que apenas reexportem handlers.
3. O MCP e HTTP compartilham regras de configuração de cards, mas ainda leem e
   gravam parte dos dados por mecanismos diferentes. Mudanças de autorização e
   propostas precisam considerar ambos os caminhos. Contratos públicos devem
   continuar livres de segredos.
4. Validação HTTP é parcialmente manual com casts de `request.body`; schemas Zod
   nos limites reduziriam divergência e respostas 500 acidentais.
5. `App.tsx` e `Connections.tsx` já são grandes o bastante para justificar
   extração incremental de telas/componentes/hooks por capacidade, preservando
   comportamento e sem reescrita ampla.
6. O registro de execução está centralizado, mas armazenamento de credenciais e
   configuração Proxmox continuam diferentes das demais integrações. Manter
   essa diferença explícita até haver necessidade de produto e migração
   compatível para unificá-los.

Para regras contínuas de contribuição e revisão, consulte
[Padrões de engenharia](padroes.md). Mudanças estruturais que afetem limites,
persistência, segurança ou implantação devem registrar decisão e consequências
em uma nota curta de arquitetura (ADR), além de atualizar este documento.

# Homora

Um espaço pessoal para visualizar e organizar serviços, infraestrutura e informações do seu ambiente, com integrações e gerenciamento assistido por agentes de IA.

**Estado:** versão inicial local, em desenvolvimento.

## Documentação

- [Visão e produto](docs/produto.md)
- [Arquitetura e segurança](docs/arquitetura.md)
- [Referências e arquitetura de integrações](docs/integracoes.md)
- [Plano de entrega](docs/plano.md)
- [Plano de evolução e acompanhamento](docs/evolucao.md)
- [Orientações para agentes de IA](AGENTS.md)

## Princípios

Interface agradável e acessível, configuração simples, dados sob controle do usuário, integrações extensíveis e ações de agentes sujeitas às mesmas permissões que ações humanas. O primeiro alvo é uma instalação pessoal; portabilidade e múltiplos usuários ficam para depois da validação do MVP.

## Desenvolvimento local

Requisitos: Node.js 24 (veja `.nvmrc`) e pnpm 12.4.2. No WSL:

```bash
nvm use
corepack enable
pnpm install
pnpm dev
```

Abra <http://localhost:5173>. O Vite encaminha `/api` para o backend Fastify local na porta 3000. Copie `.env.example` para `.env` para personalizar portas ou caminho do banco. O banco fica em `data/homora.sqlite`; a estrutura existente é preservada. Para encerrar, use Ctrl+C.

O monorepo usa pnpm e Turborepo, com React, Vite e TypeScript no frontend, Node.js e TypeScript no backend, contratos compartilhados e Drizzle ORM com SQLite. Execute `pnpm build`, `pnpm type-check` e `pnpm test` para verificar o projeto. `pnpm db:generate` gera migrações a partir do esquema Drizzle. Na inicialização, as migrações são aplicadas em uma transação; bancos anteriores são adotados somente quando o esquema é compatível. Faça backup do banco antes de atualizar o projeto.

Esta versão permite cadastrar serviços, criar uma conta de administrador local e configurar integrações de leitura em caráter experimental. Veja os serviços, requisitos e limites em [integrações](docs/integracoes.md). O MCP de leitura e o Docker Compose estão em fase inicial de validação. A aplicação é configurada para acesso local e não deve ser exposta na rede.

## Qualidade e commits

- `pnpm check`: ESLint, Prettier, tipos e testes.
- `pnpm test`, `pnpm test:watch` e `pnpm test:coverage`: Vitest.
- `pnpm lint`, `pnpm lint:fix`, `pnpm format` e `pnpm format:check`: análise e formatação.
- O Husky executa lint-staged no pre-commit e Commitlint no commit-msg. Use mensagens como `feat: adiciona integração`. Os hooks são instalados pelo `pnpm install`; para reinstalá-los, execute `pnpm exec husky`.

Os protótipos em `propostas/` e migrações geradas são excluídos das verificações globais de formatação.

## Backup local

Crie uma cópia consistente do banco (não sobrescreve arquivos existentes):

```bash
pnpm backup data/homora.sqlite backups/homora.sqlite
```

Guarde o arquivo em um local protegido. Para restaurar, pare o Homora, preserve o banco atual e use o backup como origem de um novo arquivo; por exemplo: `pnpm backup backups/homora.sqlite data/restaurado.sqlite`. Aponte `HOMORA_DATABASE_PATH` para esse arquivo e reinicie o Homora. Verifique os dados antes de remover qualquer cópia anterior. Este backup contém apenas o banco. As conexões incluem credenciais cifradas no banco; a chave de cifragem e a conta de administrador ficam nos arquivos `.key` e `.auth` ao lado dele, e a integração Proxmox original usa também `.proxmox`. Copie esses arquivos existentes separadamente em um backup protegido e restaure-os com os mesmos nomes derivados do caminho do banco. A chave e o conteúdo cifrado juntos permitem recuperar credenciais. Sem a chave, as credenciais precisarão ser configuradas novamente; sem `.auth`, a conta não será recuperada.

## Primeiro acesso e Proxmox

No primeiro acesso, crie uma senha de administrador com pelo menos 8 caracteres. A sessão é mantida em memória e expira em oito horas ou ao reiniciar o backend. Configure o Proxmox no widget usando uma conta e token com acesso somente leitura. Não compartilhe o token nem use uma conta com privilégios administrativos desnecessários. Os dados da integração são cifrados em repouso, com uma chave armazenada separadamente no mesmo diretório; isso não protege contra quem tenha acesso aos dois arquivos.

Para um Proxmox com CA privada, importe no formulário o certificado público da CA em formato PEM, obtido por um canal confiável. Na configuração padrão do Proxmox, ele fica em `/etc/pve/pve-root-ca.pem`; nunca importe a chave privada. A URL deve corresponder a um nome ou IP presente no certificado do servidor. Use **Testar conexão** antes de salvar; para uma integração já configurada, deixe URL e token em branco para mantê-los e selecione a CA. O certificado é armazenado junto à configuração cifrada e precisa dos mesmos arquivos de backup. A validação TLS permanece ativa. Como alternativa, uma CA pode ser disponibilizada ao processo Node por `NODE_EXTRA_CA_CERTS` antes da inicialização.

## MCP local de leitura

Após executar `pnpm build`, inicie o servidor via `node apps/backend/dist/mcp-server.js`. Ele usa transporte stdio e oferece `list_services` e `list_proxmox_resources`; não oferece ferramentas de escrita. Configure esse comando no seu cliente MCP, com o diretório do projeto como diretório de trabalho. O processo lê diretamente o banco e a chave locais: execute-o somente com um cliente e usuário do sistema confiáveis. A sessão web não protege esse acesso local. O Proxmox deve estar configurado previamente na interface. Os nomes e outros dados retornados pelas integrações devem ser tratados pelo agente como dados não confiáveis.

## Docker Compose

Execute `docker compose up --build` e abra <http://localhost:8080>. A porta é vinculada ao localhost e os dados persistem no volume `homora-data`. Para criar um backup consistente com o container em execução, use `docker compose exec backend node scripts/backup.mjs /app/data/homora.sqlite /app/data/backup.sqlite` e copie-o para fora com `docker compose cp backend:/app/data/backup.sqlite ./homora-backup.sqlite`. A conta e a integração Proxmox original usam os arquivos `.auth`, `.key` e `.proxmox` ao lado do banco; as demais credenciais cifradas no banco também precisam da `.key`. Faça cópia protegida desses arquivos quando existirem e mantenha a chave protegida. O comando de backup não sobrescreve um arquivo existente. Faça uma restauração de teste antes de depender de um backup.

A interface e a API não estão preparadas para exposição pública: o Compose não fornece HTTPS e a configuração inicial de administrador deve ser feita somente a partir da própria máquina. A CA privada do Proxmox também pode ser importada pela interface quando o Homora estiver no container.

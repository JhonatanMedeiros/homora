# Contribuindo

Homora está em desenvolvimento e ainda não tem licença definida. Até que os
responsáveis escolham e publiquem uma licença, não presuma permissão para
redistribuir o projeto. Veja também [segurança](SECURITY.md) antes de relatar
uma vulnerabilidade.

## Preparar e validar

Use Node.js 24 (`.nvmrc`) e pnpm 12.4.2 (`packageManager`):

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

Para trabalhar localmente, copie `.env.example` para `.env` quando precisar
alterar portas ou caminho do banco e execute `pnpm dev`. Os testes de backup
usam arquivos temporários; não use dados pessoais ou bancos reais em testes.

## Enviar mudanças

- Abra uma issue ou discussão para mudanças grandes antes de implementá-las.
- Mantenha cada proposta focada, inclua testes para mudanças de comportamento
  e atualize a documentação quando mudar instalação, configuração ou segurança.
- Mudanças no esquema precisam de migração aditiva e testes que demonstrem a
  preservação dos dados existentes.
- Não inclua segredos, bancos, backups ou dados pessoais. Confira `git status`
  antes de enviar.
- Use mensagens de commit no padrão Conventional Commits, por exemplo
  `fix: preserva dados na migração`.

Pull requests devem explicar o problema, resumir a solução e listar as
verificações executadas e limitações conhecidas. Não há garantia de prazo para
revisão enquanto o projeto estiver em estágio inicial.

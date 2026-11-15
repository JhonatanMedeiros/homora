# Conta e segurança

O Homora usa uma conta administradora local. O e-mail é usado para entrar e não recebe mensagens do aplicativo. A sessão normal dura até oito horas; a opção de manter a sessão permite até 30 dias.

## Proteja a conta

Em **Conta**, altere sua senha e configure, se desejar, verificação em duas etapas com aplicativo autenticador ou passkeys. Guarde os códigos de recuperação em um local seguro. Passkeys dependem do domínio e de um contexto seguro, como HTTPS ou `localhost`; uma mudança de domínio pode exigir cadastrá-las novamente.

A chave `.key` protege credenciais de conexões. O segredo de sessão, em `.session-secret` ou `HOMORA_SESSION_SECRET`, também protege os dados da autenticação em duas etapas. Ambos precisam ser preservados junto com o banco em um [backup protegido](import-export-backup.md).

## Recuperação e rotação

A recuperação é local, no servidor. `pnpm auth:reset` inicia o fluxo de redefinição; há opções específicas para remover apenas a segunda etapa ou as passkeys. Antes de executar, leia os comandos completos e suas consequências no [guia em inglês](/user-guide/accounts-and-security).

Para trocar uma credencial de integração, crie um novo token no serviço de origem, atualize a conexão no Homora e revogue o token antigo. A rotação da própria chave de criptografia não é suportada. Tokens de agentes podem ser substituídos ou revogados na página de agentes.

[Leia a referência completa de conta e segurança em inglês](/user-guide/accounts-and-security) e a [política de segurança do projeto](https://github.com/JhonatanMedeiros/homora/blob/main/SECURITY.md).

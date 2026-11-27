# Conta e segurança

O Homora usa uma conta administradora local. O e-mail é usado para entrar e não recebe mensagens do aplicativo. A sessão normal dura até oito horas; a opção de manter a sessão permite até 30 dias.

## Proteja a conta

Em **Conta**, altere sua senha e configure, se desejar, verificação em duas etapas com aplicativo autenticador ou passkeys. Guarde os códigos de recuperação em um local seguro. Passkeys dependem do domínio e de um contexto seguro, como HTTPS ou `localhost`; uma mudança de domínio pode exigir cadastrá-las novamente.

A chave `.key` protege credenciais de conexões. O segredo de sessão, em `.session-secret` ou `HOMORA_SESSION_SECRET`, também protege os dados da autenticação em duas etapas. Ambos precisam ser preservados junto com o banco em um [backup protegido](import-export-backup.md).

## Entrar com o provedor de identidade (OIDC)

Opcional e desativado por padrão. O Homora aceita **um** provedor OpenID Connect para a única conta administradora (Authentik, Keycloak, Authelia, Zitadel e similares). A senha continua funcionando, então uma queda do provedor nunca impede o acesso.

1. No provedor, crie um cliente confidencial com o fluxo **authorization code**. O Homora pede os escopos `openid email profile`. Se o provedor exigir uma URL de redirecionamento já na criação, informe qualquer uma e corrija no passo 3.
2. Defina as variáveis (em `.env` ou no ambiente do contêiner) e reinicie: `HOMORA_OIDC_ISSUER` (URL do emissor, somente HTTPS; ativa o recurso), `HOMORA_OIDC_CLIENT_ID` e `HOMORA_OIDC_CLIENT_SECRET` (o segredo fica só no ambiente: não vai para o banco nem para backups e nunca é exibido). Opcionais: `HOMORA_OIDC_NAME` (rótulo do botão) e `HOMORA_OIDC_REDIRECT_ORIGIN` (o endereço em que você abre o Homora).
3. Abra **Conta → Provedor de login**, copie a URL de redirecionamento exibida (`<endereço do Homora>/api/auth/callback/oidc-<id>`) e registre-a no provedor (o id vem do emissor e muda com ele). Depois confirme a senha e continue. Entre no provedor; a identidade usada fica vinculada. Somente essa identidade exata (emissor e identificador) entra: e-mail, nome ou uma conta nova no provedor nunca bastam, e o Homora nunca cria contas.
4. A página de login passa a oferecer **Entrar com …**.

Pontos de atenção: o login pelo provedor não pede o código do autenticador (use MFA no provedor); **sair é local**, o Homora não encerra a sessão no provedor; remover o vínculo pede a senha e encerra as outras sessões; o login pelo provedor dura uma sessão de navegador de oito horas (a opção de manter a sessão não se aplica); o Homora fala com o provedor pelo cliente HTTP do Better Auth, no endereço do emissor em HTTPS, sem o transporte restrito do monitoramento (para uma CA privada, defina `NODE_EXTRA_CA_CERTS`; com Compose, monte o arquivo em um `compose.override.yml`, como no guia em inglês); o **ID token** precisa trazer a claim `email`, porque o Homora não consulta o endpoint userinfo (algumas versões do Authelia exigem configurar isso). O provedor precisa assinar o ID token com uma chave que ele publica (por exemplo, RS256); tokens assinados com o client secret (HS256) são recusados. No **Authentik**, escolha uma **Signing Key** no provedor OAuth2/OpenID: sem ela, ele usa HS256 e o vínculo falha. O Homora avisa sobre isso no log. Se o provedor estiver fora do ar, entre com a senha: o Homora avisa que ele está inacessível quando não conseguiu ler a configuração do provedor desde que iniciou; se já tinha lido, o botão ainda leva ao provedor e o navegador mostra a página de erro daquele endereço (volte ao Homora). Trocar `HOMORA_OIDC_ISSUER` invalida o vínculo existente (remova e vincule de novo). Remover as variáveis desativa o recurso; o vínculo fica sem uso e a Conta continua permitindo removê-lo.

Sem acesso ao provedor ou sem conseguir entrar, execute no servidor `pnpm auth:reset --oidc-only` e depois repita com `--yes` (com Compose: `docker compose exec backend node scripts/auth-reset.mjs --oidc-only --yes`). Detalhes e variáveis completas no [guia em inglês](/user-guide/accounts-and-security) e na [decisão 0032](https://github.com/JhonatanMedeiros/homora/blob/main/docs/decisions/0032-oidc-sign-in.md).

## Recuperação e rotação

A recuperação é local, no servidor. `pnpm auth:reset` inicia o fluxo de redefinição; há opções específicas para remover apenas a segunda etapa, as passkeys ou o vínculo OIDC. Antes de executar, leia os comandos completos e suas consequências no [guia em inglês](/user-guide/accounts-and-security).

Para trocar uma credencial de integração, crie um novo token no serviço de origem, atualize a conexão no Homora e revogue o token antigo. A rotação da própria chave de criptografia não é suportada. Tokens de agentes podem ser substituídos ou revogados na página de agentes.

[Leia a referência completa de conta e segurança em inglês](/user-guide/accounts-and-security) e a [política de segurança do projeto](https://github.com/JhonatanMedeiros/homora/blob/main/SECURITY.md).

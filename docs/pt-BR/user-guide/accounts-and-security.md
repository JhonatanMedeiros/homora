# Conta e segurança

O Homora usa uma conta administradora local. O e-mail é usado para entrar e não recebe mensagens do aplicativo. A sessão normal dura até oito horas; a opção de manter a sessão permite até 30 dias.

## Proteja a conta

Em **Conta**, altere sua senha e configure, se desejar, verificação em duas etapas com aplicativo autenticador ou passkeys. Guarde os códigos de recuperação em um local seguro. Passkeys dependem do domínio e de um contexto seguro, como HTTPS ou `localhost`; uma mudança de domínio pode exigir cadastrá-las novamente.

A chave `.key` protege credenciais de conexões. O segredo de sessão, em `.session-secret` ou `HOMORA_SESSION_SECRET`, também protege os dados da autenticação em duas etapas. Ambos precisam ser preservados junto com o banco em um [backup protegido](import-export-backup.md).

## Entrar com o provedor de identidade (OIDC)

Opcional e desativado por padrão. O Homora aceita **um** provedor OpenID Connect para a única conta administradora (Authentik, Keycloak, Authelia, Zitadel e similares). A senha continua funcionando, então uma queda do provedor nunca impede o acesso.

1. Abra **Conta → Provedor de login** e informe a **URL do emissor**, exatamente como o provedor a mostra (somente HTTPS). A URL de redirecionamento (`<endereço do Homora>/api/auth/callback/oidc-<id>`) aparece logo abaixo. Se ainda não tiver o ID e o segredo do cliente, escolha **Salvar rascunho** e volte depois.
2. No provedor, crie um cliente confidencial com o fluxo **authorization code** e essa URL de redirecionamento. O Homora pede os escopos `openid email profile`.
3. De volta ao Homora, informe o **ID** e o **segredo do cliente**, opcionalmente o nome do botão, confirme a senha e escolha **Salvar e testar**. O Homora confere se o provedor responde, informa o mesmo emissor e publica uma chave de assinatura.
4. Em **Identidade**, confirme a senha e continue. Entre no provedor; a identidade usada fica vinculada. Somente essa identidade exata (emissor e identificador) entra: e-mail, nome ou uma conta nova no provedor nunca bastam, e o Homora nunca cria contas.
5. A página de login passa a oferecer **Entrar com …**, enquanto o provedor estiver ativo, funcionando e vinculado.

O segredo do cliente é guardado criptografado e não é exibido de novo. Toda alteração pede a senha.

### Comportamento e alterações

| Opção                                               | Efeito                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Manter conectado** (tela de login)                | No botão do provedor: 30 dias em vez de uma sessão de navegador de 8 horas.                                                     |
| **Redirecionamento automático**                     | Abrir o Homora leva direto ao provedor. Desativado por padrão.                                                                  |
| **Manter conectado no redirecionamento automático** | 30 dias em vez de 8 horas nesses logins.                                                                                        |
| **Desativar** / **Ativar**                          | Interrompe ou retoma o login pelo provedor; configuração, vínculo e sessões abertas continuam.                                  |
| **Editar** o emissor                                | Pede confirmação, remove a identidade vinculada e encerra as outras sessões. Salvar sem o novo segredo cria apenas um rascunho. |
| **Remover configuração**                            | Apaga a configuração salva e o vínculo e encerra as outras sessões. As variáveis `HOMORA_OIDC_*`, se existirem, voltam a valer. |

Com o **redirecionamento automático**, abra `<endereço do Homora>/login?local=1` para usar a senha. O Homora também permanece na tela de login depois que você sai (até entrar de novo nesse navegador), depois de um erro no provedor e quando o provedor não responde.

### Configurar por variáveis de ambiente

Em vez da tela, é possível definir no `.env` (ou no ambiente do contêiner) e reiniciar: `HOMORA_OIDC_ISSUER`, `HOMORA_OIDC_CLIENT_ID` e `HOMORA_OIDC_CLIENT_SECRET` (este segredo fica só no ambiente), além dos opcionais `HOMORA_OIDC_NAME` (rótulo do botão) e `HOMORA_OIDC_REDIRECT_ORIGIN` (o endereço em que você abre o Homora, usado também pela tela). A Conta mostra esses valores, e as opções de comportamento continuam valendo. **Uma configuração salva na Conta toma o lugar das variáveis**, e o segredo precisa ser digitado novamente.

Pontos de atenção: o login pelo provedor não pede o código do autenticador (use MFA no provedor); **sair é local**, o Homora não encerra a sessão no provedor; remover o vínculo pede a senha e encerra as outras sessões; o Homora fala com o provedor pelo cliente HTTP do Better Auth, no endereço do emissor em HTTPS, sem o transporte restrito do monitoramento (para uma CA privada, defina `NODE_EXTRA_CA_CERTS`; com Compose, monte o arquivo em um `compose.override.yml`, como no guia em inglês); o **ID token** precisa trazer a claim `email`, porque o Homora não consulta o endpoint userinfo (algumas versões do Authelia exigem configurar isso). O provedor precisa assinar o ID token com uma chave que ele publica (por exemplo, RS256); tokens assinados com o client secret (HS256) são recusados. No **Authentik**, escolha uma **Signing Key** no provedor OAuth2/OpenID: sem ela, o teste na Conta falha e explica o motivo. Se o provedor estiver fora do ar, entre com a senha: o botão some quando um teste encontra o problema; se ele caiu depois do último teste, o navegador mostra a página de erro daquele endereço (volte ao Homora). Trocar o emissor pelas variáveis (e não pela Conta) deixa o vínculo marcado como antigo; remova e vincule de novo.

Sem acesso ao provedor ou sem conseguir entrar, remova o vínculo e a configuração salva: execute no servidor `pnpm auth:reset --oidc-only` e depois repita com `--yes` (com Compose: `docker compose exec backend node scripts/auth-reset.mjs --oidc-only --yes`). Detalhes e variáveis completas no [guia em inglês](/user-guide/accounts-and-security) e na [decisão 0032](https://github.com/JhonatanMedeiros/homora/blob/main/docs/decisions/0032-oidc-sign-in.md).

## Recuperação e rotação

A recuperação é local, no servidor. `pnpm auth:reset` inicia o fluxo de redefinição; há opções específicas para remover apenas a segunda etapa, as passkeys ou o vínculo OIDC. Antes de executar, leia os comandos completos e suas consequências no [guia em inglês](/user-guide/accounts-and-security).

Para trocar uma credencial de integração, crie um novo token no serviço de origem, atualize a conexão no Homora e revogue o token antigo. A rotação da própria chave de criptografia não é suportada. Tokens de agentes podem ser substituídos ou revogados na página de agentes.

[Leia a referência completa de conta e segurança em inglês](/user-guide/accounts-and-security) e a [política de segurança do projeto](https://github.com/JhonatanMedeiros/homora/blob/main/SECURITY.md).

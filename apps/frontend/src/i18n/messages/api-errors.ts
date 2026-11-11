/** API error code messages. Keys follow `ERROR_MESSAGES` from the backend. */
export const en = {
  'apiError.auth-required': 'Authentication required.',
  'apiError.origin-not-allowed': 'Origin not allowed.',
  'apiError.not-found': 'Not found.',
  'apiError.invalid-data': 'Invalid data.',
  'apiError.invalid-query': 'Invalid query.',
  'apiError.invalid-decision': 'Invalid decision.',
  'apiError.invalid-columns': 'Choose between 1 and 6 columns, or automatic.',
  'apiError.invalid-card-order': 'Invalid card order.',
  'apiError.invalid-group-order': 'Invalid group order.',
  'apiError.invalid-group-name': 'Provide a group name with up to 40 characters.',
  'apiError.discovery-disabled': 'Docker discovery is not enabled.',
  'apiError.docker-unavailable':
    'Could not read the Docker containers. Check HOMORA_DOCKER_HOST and the proxy.',
  'apiError.docker-invalid-response': 'Docker returned an unexpected response.',
  'apiError.invalid-widget': 'Provide a valid integration and name.',
  'apiError.invalid-url': 'Provide a valid URL.',
  'apiError.https-url-required': 'Provide a valid HTTPS URL.',
  'apiError.invalid-token': 'Provide a valid token.',
  'apiError.invalid-credentials': 'Provide a valid username and password.',
  'apiError.invalid-entity': 'Provide a valid entity identifier.',
  'apiError.invalid-status-page': 'Provide a valid status page identifier.',
  'apiError.invalid-name-or-type': 'Provide a valid name and type.',
  'apiError.invalid-name-or-category': 'Provide a valid name and category.',
  'apiError.invalid-ca': 'Invalid CA certificate.',
  'apiError.secret-required': 'Enter the secret again when changing the address or its identity.',
  'apiError.service-not-found': 'Service not found.',
  'apiError.group-not-found': 'Group not found.',
  'apiError.group-exists': 'A group with this name already exists.',
  'apiError.group-not-empty': 'Move or remove this group’s cards before deleting it.',
  'apiError.integration-not-found': 'Integration not found.',
  'apiError.integration-unavailable': 'Integration unavailable.',
  'apiError.integration-type-unavailable': 'Integration type unavailable.',
  'apiError.integration-has-widgets': 'Remove the linked widgets before deleting the integration.',
  'apiError.integration-save-failed': 'Could not save the integration.',
  'apiError.integration-test-failed':
    'Could not test the integration. Check the connection, permissions and certificate.',
  'apiError.integration-query-failed':
    'Could not query the integration. Check the connection, permissions and certificate.',
  'apiError.integration-changed': 'The integration changed while it was being queried. Try again.',
  'apiError.widget-not-found': 'Widget not found.',
  'apiError.account-exists': 'Account already configured.',
  'apiError.account-setup-failed':
    'Could not create the account. Check the name and email, and use a password with at least 8 characters.',
  'apiError.identity-invalid': 'Invalid identity or scopes.',
  'apiError.identity-not-found': 'Identity not found.',
  'apiError.proposal-unavailable': 'Proposal unavailable.',
  'apiError.config-changed': 'The configuration changed. Review it again.',
  'apiError.proxmox-not-configured': 'Proxmox is not configured.',
  'apiError.proxmox-config-failed': 'Could not load the existing configuration.',
  'apiError.proxmox-save-failed': 'Could not save the configuration.',
  'apiError.proxmox-test-failed': 'Could not test the connection.',
  'apiError.proxmox-load-failed':
    'Could not load the Proxmox configuration. Check the integration files and the key.',
  'apiError.proxmox-failed': 'Proxmox request failed.',
  'apiError.proxmox-tls':
    'The Proxmox TLS certificate is not trusted or does not match the address. Configure a trusted CA for the backend.',
  'apiError.proxmox-dns':
    'Could not resolve the Proxmox address. Check DNS and the configured URL.',
  'apiError.proxmox-refused':
    'Connection refused by Proxmox. Check the address, the port and that the service is running.',
  'apiError.proxmox-unreachable':
    'Could not reach Proxmox. Check the network, the firewall and the configured address.',
  'apiError.proxmox-connection-failed':
    'Connection to Proxmox failed. Check the network and the configured address.',
  'apiError.proxmox-unauthorized':
    'Proxmox rejected the authentication (HTTP 401). Check the token ID and secret.',
  'apiError.proxmox-forbidden':
    'Proxmox denied access (HTTP 403). Check the user and token permissions.',
  'apiError.proxmox-http-error':
    'Proxmox returned an unexpected HTTP status. Check the service and the configured address.',
  'apiError.proxmox-invalid-response':
    'Invalid response from Proxmox. Check that the URL points to a Proxmox server.',
  'apiError.proxmox-incomplete-response': 'Incomplete response from Proxmox.',
  'apiError.proxmox-response-too-large': 'The Proxmox response exceeded the allowed size.',
  'apiError.proxmox-timeout': 'Timed out connecting to Proxmox. Check the network and firewall.',
} as const;

export const ptBR = {
  'apiError.auth-required': 'Autenticação necessária.',
  'apiError.origin-not-allowed': 'Origem não autorizada.',
  'apiError.not-found': 'Não encontrado.',
  'apiError.invalid-data': 'Dados inválidos.',
  'apiError.invalid-query': 'Consulta inválida.',
  'apiError.invalid-decision': 'Decisão inválida.',
  'apiError.invalid-columns': 'Escolha de 1 a 6 colunas, ou automático.',
  'apiError.invalid-card-order': 'Ordem de cards inválida.',
  'apiError.invalid-group-order': 'Ordem de grupos inválida.',
  'apiError.invalid-group-name': 'Informe um nome de grupo com até 40 caracteres.',
  'apiError.discovery-disabled': 'A descoberta Docker não está ativada.',
  'apiError.docker-unavailable':
    'Não foi possível ler os contêineres do Docker. Confira HOMORA_DOCKER_HOST e o proxy.',
  'apiError.docker-invalid-response': 'O Docker devolveu uma resposta inesperada.',
  'apiError.invalid-widget': 'Informe integração e nome válidos.',
  'apiError.invalid-url': 'Informe uma URL válida.',
  'apiError.https-url-required': 'Informe uma URL HTTPS válida.',
  'apiError.invalid-token': 'Informe um token válido.',
  'apiError.invalid-credentials': 'Informe um usuário e uma senha válidos.',
  'apiError.invalid-entity': 'Informe um identificador de entidade válido.',
  'apiError.invalid-status-page': 'Informe um identificador de página de status válido.',
  'apiError.invalid-name-or-type': 'Informe nome e tipo válidos.',
  'apiError.invalid-name-or-category': 'Informe nome e categoria válidos.',
  'apiError.invalid-ca': 'Certificado de CA inválido.',
  'apiError.secret-required': 'Informe novamente o segredo ao alterar o endereço ou a identidade.',
  'apiError.service-not-found': 'Serviço não encontrado.',
  'apiError.group-not-found': 'Grupo não encontrado.',
  'apiError.group-exists': 'Já existe um grupo com esse nome.',
  'apiError.group-not-empty': 'Mova ou remova os cards deste grupo antes de excluí-lo.',
  'apiError.integration-not-found': 'Integração não encontrada.',
  'apiError.integration-unavailable': 'Integração indisponível.',
  'apiError.integration-type-unavailable': 'Tipo de integração indisponível.',
  'apiError.integration-has-widgets': 'Remova os widgets vinculados antes de excluir a integração.',
  'apiError.integration-save-failed': 'Não foi possível salvar a integração.',
  'apiError.integration-test-failed':
    'Não foi possível testar a integração. Verifique conexão, permissões e certificado.',
  'apiError.integration-query-failed':
    'Não foi possível consultar a integração. Verifique conexão, permissões e certificado.',
  'apiError.integration-changed': 'A integração mudou durante a consulta. Tente novamente.',
  'apiError.widget-not-found': 'Widget não encontrado.',
  'apiError.account-exists': 'Conta já configurada.',
  'apiError.account-setup-failed':
    'Não foi possível criar a conta. Verifique nome e e-mail, e use uma senha com pelo menos 8 caracteres.',
  'apiError.identity-invalid': 'Identidade ou escopos inválidos.',
  'apiError.identity-not-found': 'Identidade não encontrada.',
  'apiError.proposal-unavailable': 'Proposta indisponível.',
  'apiError.config-changed': 'A configuração mudou. Revise novamente.',
  'apiError.proxmox-not-configured': 'Proxmox não configurado.',
  'apiError.proxmox-config-failed': 'Não foi possível carregar a configuração existente.',
  'apiError.proxmox-save-failed': 'Não foi possível salvar a configuração.',
  'apiError.proxmox-test-failed': 'Não foi possível testar a conexão.',
  'apiError.proxmox-load-failed':
    'Não foi possível carregar a configuração do Proxmox. Verifique os arquivos de integração e a chave.',
  'apiError.proxmox-failed': 'A consulta ao Proxmox falhou.',
  'apiError.proxmox-tls':
    'O certificado TLS do Proxmox não é confiável ou não corresponde ao endereço. Configure uma CA confiável para o backend.',
  'apiError.proxmox-dns':
    'Não foi possível resolver o endereço do Proxmox. Verifique o DNS e a URL configurada.',
  'apiError.proxmox-refused':
    'Conexão recusada pelo Proxmox. Verifique o endereço, a porta e se o serviço está em execução.',
  'apiError.proxmox-unreachable':
    'Não foi possível alcançar o Proxmox. Verifique a rede, o firewall e o endereço configurado.',
  'apiError.proxmox-connection-failed':
    'Falha de conexão com o Proxmox. Verifique a rede e o endereço configurado.',
  'apiError.proxmox-unauthorized':
    'O Proxmox rejeitou a autenticação (HTTP 401). Verifique o ID e o segredo do token.',
  'apiError.proxmox-forbidden':
    'O Proxmox negou o acesso (HTTP 403). Verifique as permissões do usuário e do token.',
  'apiError.proxmox-http-error':
    'O Proxmox respondeu com um status HTTP inesperado. Verifique o serviço e o endereço configurado.',
  'apiError.proxmox-invalid-response':
    'Resposta inválida do Proxmox. Verifique se a URL aponta para um servidor Proxmox.',
  'apiError.proxmox-incomplete-response': 'Resposta incompleta do Proxmox.',
  'apiError.proxmox-response-too-large': 'A resposta do Proxmox excedeu o tamanho permitido.',
  'apiError.proxmox-timeout':
    'Tempo esgotado ao conectar ao Proxmox. Verifique a rede e o firewall.',
} as const;

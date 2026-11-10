import { getLocale } from './index';

/**
 * O backend responde mensagens de erro em português. Enquanto a API não devolver
 * códigos estáveis, a interface traduz as mensagens conhecidas por esta tabela;
 * as demais aparecem como foram recebidas.
 */
const english: Record<string, string> = {
  'Autenticação necessária.': 'Authentication required.',
  'Consulta inválida.': 'Invalid query.',
  'Conta já configurada.': 'Account already configured.',
  'Credenciais inválidas ou tentativas excedidas.': 'Invalid credentials or too many attempts.',
  'Dados inválidos.': 'Invalid data.',
  'Decisão inválida.': 'Invalid decision.',
  'Grupo não encontrado.': 'Group not found.',
  'Identidade não encontrada.': 'Identity not found.',
  'Identidade ou escopos inválidos.': 'Invalid identity or scopes.',
  'Informe integração e nome válidos.': 'Provide a valid integration and name.',
  'Informe um nome de grupo com até 40 caracteres.':
    'Provide a group name with up to 40 characters.',
  'Integração indisponível.': 'Integration unavailable.',
  'Integração não encontrada.': 'Integration not found.',
  'Já existe um grupo com esse nome.': 'A group with this name already exists.',
  'Mova ou remova os cards deste grupo antes de excluí-lo.':
    'Move or remove this group’s cards before deleting it.',
  'Não encontrado.': 'Not found.',
  'Não foi possível criar a conta. Use uma senha com pelo menos 8 caracteres.':
    'Could not create the account. Use a password with at least 8 characters.',
  'Não foi possível salvar a configuração.': 'Could not save the configuration.',
  'Não foi possível testar a integração. Verifique conexão, permissões e certificado.':
    'Could not test the integration. Check the connection, permissions and certificate.',
  'Ordem de cards inválida.': 'Invalid card order.',
  'Ordem de grupos inválida.': 'Invalid group order.',
  'Origem não autorizada.': 'Origin not allowed.',
  'Proposta indisponível.': 'Proposal unavailable.',
  'Proxmox não configurado.': 'Proxmox is not configured.',
  'Remova os widgets vinculados antes de excluir a integração.':
    'Remove the linked widgets before deleting the integration.',
  'Serviço não encontrado.': 'Service not found.',
  'Widget não encontrado.': 'Widget not found.',
  'Informe nome e tipo válidos.': 'Provide a valid name and type.',
  'Informe um token válido.': 'Provide a valid token.',
  'Informe uma URL válida.': 'Provide a valid URL.',
  'Informe uma URL HTTPS válida.': 'Provide a valid HTTPS URL.',
  'Certificado de CA inválido.': 'Invalid CA certificate.',
  'Credenciais exigem uma conexão HTTPS.': 'Credentials require an HTTPS connection.',
  'Configuração da integração inválida.': 'Invalid integration configuration.',
  'Credenciais da integração inválidas.': 'Invalid integration credentials.',
  'Cabeçalhos da integração inválidos.': 'Invalid integration headers.',
  'Destino inválido.': 'Invalid destination.',
  'Destino não autorizado.': 'Destination not allowed.',
  'Destino aponta para endereço não permitido.': 'Destination points to a disallowed address.',
};

/** Traduz uma mensagem de erro da API para o idioma atual, quando conhecida. */
export function apiError(message: string): string {
  return getLocale() === 'en' ? (english[message] ?? message) : message;
}

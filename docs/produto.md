# Visão do produto

Homora reúne serviços e informações úteis em um painel personalizável. O usuário pode organizar seu ambiente pela interface ou solicitar mudanças a um agente conectado por MCP. Proxmox é a primeira integração de infraestrutura planejada, mas não define o alcance do produto.

## Público e problemas

Pessoas que mantêm serviços próprios precisam reunir links, acompanhar disponibilidade e configurar integrações sem editar muitos arquivos. Um agente pode reduzir o trabalho, mas precisa operar com permissões explícitas e prestar contas das alterações.

## Experiências principais

1. Criar e organizar grupos e cards de serviços, com nome, URL, ícone e descrição.
2. Consultar estado de disponibilidade, com indicação de última verificação e estado desconhecido quando não houver dados confiáveis.
3. Conectar o Proxmox com credenciais de leitura e visualizar nós, VMs e containers disponíveis.
4. Revisar sugestões de cards a partir do inventário; nomes e URLs descobertos são sugestões, não fatos garantidos.
5. Pedir a um agente para consultar a configuração e propor uma alteração; revisar e aprovar a proposta na interface antes da aplicação.

## MVP

Dashboard responsivo, grupos e cards editáveis, busca, verificação de disponibilidade, integração Proxmox somente leitura, propostas MCP para mudanças de configuração, autenticação de acesso e histórico de ações. A interface deve continuar utilizável sem agente e sem Proxmox.

Fora do MVP: reiniciar VMs, instalação automática de serviços, descoberta irrestrita da rede, plugins de terceiros, múltiplos usuários, aplicativo móvel nativo e marketplace.

## Critérios de aceitação

- Um usuário autenticado cria, edita, move e remove um card; dados persistem após reiniciar.
- Falhas de monitoramento exibem estado desconhecido ou indisponível com horário da última tentativa, sem bloquear a página.
- Credenciais Proxmox nunca aparecem no navegador, em respostas MCP ou logs; o inventário usa uma conta limitada à leitura.
- O agente consegue consultar dados autorizados e criar uma proposta; a alteração só ocorre após aprovação humana vinculada à proposta exata.
- Ações aprovadas, rejeitadas e falhas ficam registradas sem segredos.
- Interface funciona em telas pequenas e com teclado; uma integração indisponível não impede o uso dos demais cards.

## Indicadores de validação

Tempo para cadastrar o primeiro serviço, quantidade de etapas para conectar uma integração, sucesso das verificações, frequência de correção de sugestões e clareza das propostas. Medição é opcional e local por padrão; nenhuma telemetria externa é pressuposta.

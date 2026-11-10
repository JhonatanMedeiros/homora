# Avaliação de produto e concorrência

**Data:** 2026-11-10  
**Escopo:** funcionalidades presentes no branch `feat/roadmap-completion` em
`d98e52c`, documentação do Homora e documentação oficial de produtos similares.

Esta é uma comparação de capacidades publicadas, não uma avaliação completa de
desempenho, segurança, adoção ou satisfação de usuários. O parecer visual foi
feito por leitura do JSX e CSS, sem renderização em navegador. A recomendação de
posicionamento abaixo é uma hipótese para validar, não uma decisão de produto.

## Conclusão

Como homepage genérica, o Homora ainda não oferece uma vantagem clara sobre
alternativas maduras. Ele já organiza links, grupos e verificações simples, mas
seu valor de homelab — dados de integrações, estado de infraestrutura e relação
entre aplicações e máquinas — fica escondido ou não foi implementado. A interface
também destaca “Agentes” apesar de o agente só consultar dados e propor mudanças
em cards, sem ser parte necessária do uso diário.

Há uma base técnica promissora: configuração pela interface, operação local,
integração Proxmox somente leitura, opt-in explícito para destinos privados e
propostas MCP revisadas por uma pessoa. Isso ainda não forma uma experiência
distintiva. A recomendação é posicionar o Homora como **mapa operacional do
homelab**: um lugar para abrir os serviços, entender se respondem e ver onde
estão hospedados. Proxmox e agentes seriam opcionais; o painel de links deve
continuar útil sem ambos.

## Comparação observada

| Produto      | Experiência documentada oficialmente                                                                                                                            | Implicação para o Homora                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage     | Widgets de serviço associados aos próprios atalhos, widgets informativos, integração Docker e um widget Proxmox para contagens de VMs/containers e CPU/memória. | Um catálogo de conexões fora da home e uma lista de serviços sem dados associados parecem rasos por comparação.                                                      |
| Homarr       | Separa apps, integrações, widgets e boards; permite colocar e redimensionar apps/widgets no board, ligar apps a integrações e combinar estatísticas.            | O modelo mental entre serviço, conexão, widget e tela é claro e configurável. O Homora implementa as entidades, mas ainda não liga a apresentação do widget ao card. |
| Dashy        | Oferece temas e layouts configuráveis, ícones, indicadores de estado, widgets e formas alternativas de navegar.                                                 | Mais temas e opções não são uma diferenciação sustentável para o Homora.                                                                                             |
| Glance       | Foca numa tela configurável com várias páginas e widgets de feeds, estado de containers e estatísticas do servidor.                                             | O público também espera informação legível à primeira vista; uma homepage de apenas atalhos e pontos de estado não basta como diferencial.                           |
| Homora atual | Grupos e atalhos editáveis, monitoramento HTTP básico, Proxmox em outra aba, quatro adaptadores experimentais e MCP local para leitura/propostas de cards.      | Ainda não exibe na home os dados que poderiam justificar uma proposta específica para homelab.                                                                       |

Fontes dos concorrentes: [widgets de serviço do Homepage](https://gethomepage.dev/widgets/),
[integração Docker do Homepage](https://gethomepage.dev/configs/docker/),
[widget Proxmox do Homepage](https://gethomepage.dev/widgets/services/proxmox/),
[estrutura de apps, integrações e widgets do Homarr](https://homarr.dev/docs/getting-started/),
[integrações do Homarr](https://homarr.dev/docs/management/integrations/),
[widgets do Homarr](https://homarr.dev/docs/widgets/),
[recursos documentados do Dashy](https://docs.dashy.to/) e
[Glance no GitHub](https://github.com/glanceapp/glance).

## Lacunas confirmadas no código

1. **A home não é uma visão operacional.** A aba Serviços mostra atalhos e um
   estado HTTP por serviço. Proxmox, conexões e resultados de integração ficam na
   aba Integrações; não há relação entre um serviço e sua VM ou container.
2. **Widgets ainda são registros nominais.** Um widget armazena conexão e nome,
   mas não configuração, posição nem campo consultado. A consulta ignora o
   identificador do widget e chama o endpoint genérico da conexão. Widgets da
   mesma conexão, portanto, mostram o mesmo resultado; nenhum aparece na home.
3. **O indicador de disponibilidade é impreciso.** Só respostas HTTP 2xx viram
   “Disponível”. 401/403, 404, redirecionamentos e falhas de rede terminam como
   “Indisponível”, embora vários desses casos signifiquem que o serviço respondeu
   ou que exige autenticação. A rotina verifica apenas os 25 primeiros serviços
   em cada ciclo; os restantes ficam como desconhecidos, sem aviso específico.
4. **Os adaptadores não são widgets de produto completos.** Jellyfin retorna
   nome e versão; Home Assistant consulta uma entidade; Uptime Kuma retorna
   contagens; AdGuard Home retorna estado e versão. O catálogo lista os tipos,
   mas essas respostas são consultadas numa tela separada e não viram conteúdo
   do card. Nenhum desses adaptadores foi validado em um serviço real.
5. **A IA recebe mais destaque que o valor entregue.** O cliente MCP local
   disponibiliza consulta de serviços, consulta do inventário Proxmox e criação
   de propostas de card. A decisão é humana. Não há assistente conversacional
   embutido nem proposta de associação entre serviço e guest Proxmox. Isso é uma
   boa fronteira de segurança, mas não sustenta “gerenciamento assistido por IA”
   como principal promessa de uso diário.

## Por que ainda pode parecer genérico

Esta parte é julgamento de design, não fato mensurável. A tela usa padrões
comuns de painel administrativo — abas, subtítulos genéricos, busca global,
cards escuros e cor de destaque — sem representar uma ideia própria do
homelab. O conteúdo também não reforça uma rotina específica: “estado
desconhecido” se repete em cards sem contexto, enquanto dados de infraestrutura
ficam em outra seção. Trocar cores ou ícones novamente não resolveria essa
desconexão.

## Direção recomendada para validar

### Release 1 — informação útil e verdadeira

- Na home, mostrar um resumo pequeno de disponibilidade e a integração Proxmox
  quando configurada; se ela não estiver configurada, manter a home simples.
- Tornar o estado do monitor semanticamente honesto: “responde”, “exige login”,
  “não encontrado”, “sem resposta” e “não verificado”, registrando o código HTTP
  e a latência sem seguir redirecionamentos.
- Remover o limite silencioso de 25 ou expor cobertura e fila de checagem para
  que nenhum card pareça monitorado sem ter sido verificado.
- Fazer o card servir primeiro como atalho; colocar administração num modo de
  edição explícito. Mostrar ícone confiável, endereço/host e um único resumo de
  estado.
- Só chamar algo de widget quando tiver configuração real, renderização própria
  na home, estado vazio/erro e relação clara com a conexão que fornece os dados.

### Release 2 — localização e impacto

- Permitir associar manualmente um card a um nó e guest Proxmox; oferecer
  sugestões revisáveis quando houver evidência confiável. Não deduzir relação
  somente pelo nome.
- Mostrar onde cada aplicação roda e quais cards podem ser afetados quando o
  respectivo guest ou nó para.
- Tratar MCP como uma interface opcional para ler e propor as mesmas operações
  já disponíveis na interface. Manter a decisão e a auditoria visíveis no
  produto; não usar “IA” como substituto de uma proposta de valor clara.

### Direção visual

Antes de escolher uma nova paleta, organizar a tela pela relação **serviço →
estado → máquina**. Usar nomes de grupo, host, VM/CT, latência e última resposta
como conteúdo principal. Status deve combinar texto e forma, não apenas cor.
Testar um protótipo em dados fictícios de um homelab típico e comparar o tempo
para responder “o que caiu e onde roda?” com a home atual. Não acrescentar mais
adaptadores rasos nem conteúdo de IA para aumentar densidade visual.

## Decisões que precisam de validação

- Essa hipótese deve ser testada com pessoas que administram homelabs; a leitura
  dos concorrentes não substitui entrevistas nem uso real.
- O vínculo card↔guest depende de ambiente Proxmox real, permissões limitadas,
  casos com apps em vários containers e regras de privacidade do inventário.
- O MVP deve continuar útil sem Proxmox e sem agentes, conforme a visão atual do
  produto.
- Não afirmar que o Homora supera os concorrentes antes de validar a home
  operacional, comportamento multi-dispositivo na rede local e integrações
  reais.

# Plano de evolução do Homora

Este plano transforma a análise inicial do repositório em etapas de trabalho.
A prioridade é ter uma homepage útil e confiável para um homelab pessoal,
configurável pela interface e utilizável sem Proxmox ou agente de IA. A
integração com infraestrutura e a assistência por agentes podem diferenciá-la
à medida que o núcleo amadurecer.

Atualize os itens ao concluí-los, registrando resultados e decisões relevantes
no próprio repositório. Um item só deve ser marcado como concluído depois da
implementação e da validação indicadas; código existente não significa que o
fluxo completo já foi validado. As etapas podem ser divididas em tarefas menores.

## P0 — Consolidar e validar a base

- [ ] Revisar os arquivos modificados e não rastreados, preservando o trabalho
      existente e verificando se dados locais e segredos estão fora do Git.
- [ ] Registrar uma primeira versão coerente no Git após a revisão.
- [ ] Instalar as dependências em ambiente com acesso ao registro npm e executar
      `pnpm check` e `pnpm build`; registrar e corrigir falhas encontradas.
- [ ] Validar uma instalação limpa e o fluxo local: primeiro acesso, cadastro,
      edição, exclusão, busca e persistência após reinicialização.
- [ ] Subir o Docker Compose e validar inicialização, persistência e atualização
      preservando dados.
- [ ] Testar backup e restauração completos, incluindo os arquivos de conta,
      chave e integração quando aplicável; documentar a proteção e a recuperação.
- [ ] Registrar problemas encontrados, sua prioridade e limitações conhecidas.

**Conclusão:** instalação e fluxo principal reproduzíveis, verificações passando
e restauração comprovada em ambiente de teste.

## P1 — Fechar o núcleo da homepage

- [ ] Definir e implementar grupos independentes e ordenação de grupos e cards,
      com migração dos serviços existentes.
- [ ] Permitir configurar ícones e melhorar a apresentação dos cards.
- [ ] Revisar busca, filtros, estados vazios e mensagens de erro.
- [ ] Validar uso em telas pequenas e com teclado, incluindo foco e diálogos.
- [ ] Confirmar que o painel funciona sem Proxmox e sem MCP.

**Conclusão:** é possível organizar e usar o painel diariamente pela interface,
com dados preservados e sem depender de integrações opcionais.

## P2 — Acesso e segurança para o homelab

- [ ] Definir os cenários suportados: acesso local, rede privada e proxy reverso,
      incluindo configuração inicial, HTTPS e origens permitidas.
- [ ] Revisar sessões, cookies, proteção contra CSRF, limites de requisição e
      comportamento atrás de proxy para os cenários escolhidos; testar os limites.
- [ ] Avaliar armazenamento, permissões, rotação e recuperação de segredos e
      documentar o modelo de confiança e suas limitações.
- [ ] Definir política de destinos para integrações e monitoramento: autorização
      explícita de redes privadas, portas, DNS, redirecionamentos e limites.

**Conclusão:** modelo de acesso documentado e validado para os cenários
suportados; não anunciar exposição em rede antes dessa validação.

## P3 — Disponibilidade e Proxmox

- [ ] Implementar verificações periódicas com limites, timeout, cache e política
      de destinos definida em P2.
- [ ] Mostrar estado desconhecido ou indisponível e horário da última tentativa,
      sem impedir o carregamento do restante do painel.
- [ ] Validar Proxmox em ambiente real com token de leitura e TLS confiável,
      incluindo falhas de conexão, certificado e permissões.
- [ ] Apresentar inventário útil e avaliar sugestões de cards revisáveis, sem
      alterar a infraestrutura automaticamente.

**Conclusão:** falhas de serviços e integrações são claras e isoladas, e o
inventário Proxmox foi validado com permissões reduzidas.

## P4 — MCP e alterações com aprovação

- [ ] Definir identidade, escopos e revogação de agentes e alinhar o acesso MCP
      às regras da aplicação. O MCP atual é local, somente leitura e acessa arquivos
      diretamente; a sessão web não o protege.
- [ ] Disponibilizar consultas autorizadas sem expor segredos e tratar dados
      externos como não confiáveis.
- [ ] Implementar propostas de alterações de cards com revisão humana, diff,
      expiração e aprovação vinculada à versão exata da proposta e da configuração.
- [ ] Aplicar alterações de forma transacional e registrar aprovação, rejeição e
      falhas; testar autorização, concorrência, repetição e injeção de instruções.
- [ ] Manter ações de infraestrutura, como reiniciar VMs, fora desta etapa.

**Conclusão:** agentes só acessam o que foi autorizado e alterações propostas
são revisáveis e auditáveis antes de serem aplicadas.

## P5 — Preparar publicação open source

- [ ] Escolher licença e revisar licenças e atribuições das dependências e assets.
- [ ] Verificar disponibilidade do nome e possíveis conflitos de marca.
- [ ] Documentar contribuição, relato de vulnerabilidades, suporte e limitações.
- [ ] Preparar instalação, atualização, backup e recuperação reproduzíveis;
      testar instalação limpa e upgrade antes de publicar uma release.
- [ ] Validar os critérios do MVP com uso real e decidir o escopo da primeira
      versão pública. Avaliar instalador para Proxmox depois de releases confiáveis.

**Conclusão:** outra pessoa consegue entender, instalar, atualizar e contribuir
com o projeto usando a documentação disponível.

## Registro inicial

- Análise inicial: a base inclui CRUD de serviços, autenticação local, SQLite,
  Proxmox experimental, MCP local de leitura, testes e configuração de Compose.
- Na análise, boa parte da implementação estava não rastreada no Git. Verificar
  novamente antes de qualquer commit, pois o estado pode mudar.
- As verificações não foram concluídas na análise: as dependências não estavam
  instaladas e o ambiente não conseguiu acessar o registro npm. Não há, portanto,
  resultado confirmado de testes, build ou execução integrada.
- Comparação inicial: simplicidade e gestão de atalhos são expectativas básicas;
  integração com infraestrutura e assistência por agentes são oportunidades a
  validar. Consulte [produto](produto.md) e [arquitetura](arquitetura.md).

## Validação inicial da base

- Dependências instaladas com lockfile congelado; `pnpm check` e `pnpm build`
  passaram. A suíte inclui testes de backup com banco ativo e dados no WAL.
- Imagens Compose construídas e aplicação iniciada em projeto e volume isolados.
  Pela API, primeiro acesso, login, criação, edição, listagem, reinício com
  persistência e exclusão passaram. O volume temporário foi removido.
- A validação acima não cobre o fluxo visual completo no navegador, atualização
  entre versões ou restauração dos arquivos `.auth`, `.key` e `.proxmox`.
  Proxmox real também permanece pendente.
- Corrigidos tratamento de respostas Proxmox inválidas ou interrompidas,
  recuperação após falha no primeiro login, conflito da categoria “Todos” e
  apresentação de inventário antigo após falha de consulta.
- Arquivos de IDE foram incluídos no `.gitignore`. Dados e segredos nos caminhos
  locais padrão estão ignorados; caminhos personalizados devem ser protegidos
  separadamente. A revisão completa antes do primeiro commit permanece pendente.

## Trabalho em andamento — integrações

- A análise e o plano técnico estão em [integrações](integracoes.md). A primeira
  versão do projeto foi registrada no Git e a conexão Proxmox com CA importada
  funcionou no ambiente do usuário; os demais cenários reais ainda exigem testes.
- O registro de adaptadores, catálogo autenticado, cache Proxmox e migração
  aditiva de instâncias e widgets são fundações iniciais. As novas tabelas ainda
  não possuem API ou interface completas; o cofre Proxmox antigo permanece em uso.
- Jellyfin e Home Assistant têm protótipos isolados com testes simulados, ainda
  indisponíveis na interface. Uptime Kuma e AdGuard Home foram pesquisados, mas
  ainda não foram implementados. Nenhum dos quatro foi validado em ambiente real.
- A política e o transporte de rede são experimentais e ainda não protegem os
  adaptadores existentes. Precisam de revisão de endereços especiais, integração
  e testes adicionais antes de expor destinos configuráveis.

## Redesenho da interface

- A interface foi refeita a partir da proposta `propostas/console-v2.html`:
  começa pelo celular (navegação inferior, alvos de toque de 44 px), usa tema
  claro e escuro conforme o sistema (com alternância manual), paleta grafite e
  azul, e fontes Hanken Grotesk e Bricolage Grotesque servidas localmente
  (SIL OFL 1.1, ver `apps/frontend/src/fonts/README.md`).
- O cadastro e a edição de serviços passaram a usar um formulário na própria
  página, em vez de diálogo modal. A remoção exige confirmação na própria linha.
  Serviços são agrupados por categoria; a busca também considera o endereço, e
  Enter abre o primeiro resultado (`Ctrl K` ou `/` focam a busca).
- O painel de integrações mostra o Proxmox (CPU e memória dos nós, lista de VMs
  e containers e data da última consulta) e o catálogo de integrações
  disponíveis, com o mesmo conteúdo e comportamento que já existiam. Os cartões “Monitoramento” e “Assistente”
  e o relógio foram removidos: eram apenas texto de recurso planejado.
- Não implementado, apenas previsto na proposta: estado e histórico de
  disponibilidade por serviço, sugestão de cards a partir do Proxmox e fila de
  propostas do agente. Dependem de monitoramento e do modelo de aprovação.
- Validação: `pnpm check` e `pnpm build` passaram. O fluxo foi exercitado em
  navegador headless (primeiro acesso, cadastro, confirmação de remoção,
  abas e formulário do Proxmox) com banco temporário, em 390 e 1440 px, sem
  erros no console nem rolagem horizontal. Não foram verificados: leitor de
  tela, navegação completa por teclado, aparelho móvel real e Proxmox real.
  Por isso os itens de telas pequenas e teclado do P1 seguem abertos.

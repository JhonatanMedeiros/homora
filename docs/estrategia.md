# Estratégia: Homora como alternativa open source

**Data:** 2026-11-10
**Estado:** decisão de direção tomada pelo mantenedor; itens abaixo são
planejados, não implementados. O estado real de cada item fica em
[evolucao.md](evolucao.md).

Este documento reposiciona o Homora frente ao [Homepage](https://github.com/gethomepage/homepage)
e ao [Dashy](https://github.com/Lissy93/dashy), os projetos de referência do
mantenedor. Ele complementa a [avaliação de produto](avaliacao-produto.md), que
tem a comparação detalhada com outros painéis, e não substitui o
[plano de evolução](evolucao.md), que continua sendo o registro de progresso.

## Decisões

| Tema           | Decisão                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Posicionamento | **Paridade nos itens que travam a adoção, mais um diferencial:** propostas de agente revisadas por humano, com permissões explícitas e auditoria. Não competir em contagem de integrações. |
| Configuração   | O SQLite continua sendo a fonte da verdade. Arquivos YAML/JSON servem para **importar, exportar, versionar e migrar** do Homepage e do Dashy.                                              |
| Idioma         | Inglês como idioma padrão de README, documentação de uso e interface, com i18n e pt-BR completo. Documentos internos de engenharia podem continuar em português.                           |
| Princípio      | Continua valendo: útil sem Proxmox e sem agente de IA; segurança de destinos e segredos não é relaxada para ganhar recursos.                                                               |

## Comparação factual

Fontes: README dos dois projetos, consultados em 2026-11-10. Capacidades mudam
entre versões; confirme antes de afirmar paridade publicamente.

| Área           | Homepage / Dashy (documentado)                                                                 | Homora (código atual)                                                              |
| -------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Integrações    | Homepage descreve integrações para mais de 100 serviços.                                       | Quatro adaptadores de leitura e Proxmox; nenhum validado em instância real.        |
| Widgets        | Dados do serviço junto ao atalho, mais widgets informativos (clima, hora, busca).              | Widgets são registros nominais, ficam na aba Integrações e não aparecem na home.   |
| Descoberta     | Homepage descobre serviços por labels Docker.                                                  | Não há descoberta.                                                                 |
| Configuração   | Homepage: YAML ou labels Docker. Dashy: um `conf.yml`, editável também pela interface.         | Banco SQLite e interface; sem importação nem exportação.                           |
| Status         | Dashy: código HTTP e ping ICMP, com intervalos configuráveis. Homepage: estado de contêineres. | HTTP com estado por código e latência, ping ICMP opcional e intervalo por serviço. |
| Acesso         | OIDC nos dois; Dashy também tem usuários, tipos e convidado somente leitura.                   | Uma conta de administrador com senha local.                                        |
| Idiomas        | Homepage com mais de 40; Dashy com mais de 30.                                                 | Somente português do Brasil.                                                       |
| Personalização | Temas, CSS próprio (os dois); Dashy tem configurador de cores e várias páginas.                | Tema claro e escuro; sem CSS próprio nem várias páginas.                           |
| Busca          | Dashy: atalhos numéricos e busca web com "bangs"; Homepage: busca rápida.                      | Busca local com `Ctrl K` e `/`.                                                    |
| Ícones         | Hipótese a confirmar: bibliotecas de ícones referenciadas por nome.                            | Apenas emoji ou inicial.                                                           |

O que o Homora já tem e as fontes consultadas não descrevem: aprovação humana
vinculada à proposta exata, identidades de agente com escopos e revogação,
auditoria de alterações, política de rede contra SSRF por destino e segredos
cifrados fora do navegador.

## Fases

Cada fase deve entregar algo que um usuário novo perceba. Os critérios de
conclusão exigem validação em ambiente real, não apenas testes automatizados.

### R0 — Adoção sem atrito

Objetivo: alguém conhece o projeto, instala em minutos e traz o que já tem.

- [ ] Publicar imagem Docker reproduzível (amd64 e arm64) e documentar o upgrade.
- [ ] Exportar e importar serviços, grupos e ordem em YAML/JSON, com validação e
      relatório de itens ignorados. Segredos nunca entram no arquivo.
- [ ] Importar o `services.yaml`/`bookmarks.yaml` do Homepage e a configuração do
      Dashy, mostrando uma prévia revisável antes de gravar.
- [ ] Biblioteca de ícones por nome (conjunto open source com licença
      compatível), mantendo emoji e URL própria.
- [ ] README, instalação e capturas de tela em inglês; i18n com inglês padrão e
      pt-BR completo.

**Conclusão:** instalação limpa e importação de uma configuração real do
Homepage e do Dashy, sem edição manual, em um ambiente de teste.

### R1 — Home viva e estado honesto

- [ ] Estado semântico do monitor: responde, exige login, não encontrado, sem
      resposta, não verificado; com código HTTP e latência, sem seguir
      redirecionamentos (política de destinos de P2 preservada).
- [x] Remover o limite silencioso de 25 serviços, ou expor cobertura e fila.
- [ ] Widgets dentro do card, com configuração, estado vazio e de erro; chamar
      de widget só o que tem renderização própria na home.
- [ ] Descoberta Docker por labels com sugestões revisáveis e acesso somente
      leitura ao socket.
- [x] Opção de ping ICMP e de intervalo por serviço, com limites.
- [ ] Ícones de marca por nome (conjunto open source com licença compatível,
      como o dashboard-icons), além dos ícones genéricos `lucide:`.
- [ ] Layout em colunas com larguras escolhidas por grupo, além da grade fixa.
- [ ] Faixa superior opcional com data, hora e recursos do sistema (CPU,
      memória, disco) vindos de uma integração, sem agente instalado no host.

**Conclusão:** a home responde "o que caiu?" sem abrir outra aba, e nenhum card
parece monitorado sem ter sido verificado.

### R2 — Integrações extensíveis

- [ ] Adaptador declarativo (descrição de capacidades, campos e coleta) para
      reduzir o custo de cada integração e permitir contribuições externas.
- [ ] Priorizar cerca de dez integrações de maior uso entre self-hosters,
      validando cada uma contra uma instância real. A lista é hipótese do
      mantenedor e deve ser revista com dados de uso e pedidos da comunidade.
- [ ] Integrações pedidas pelo caso de referência (ver abaixo), após o modelo
      declarativo: Portainer, Cloudflare, Tailscale, Netbird, TrueNAS, Beszel e
      Speedtest Tracker. Cada uma só conta como pronta com instância real.
- [ ] Extrair o Proxmox do cofre legado para o mesmo modelo dos demais.
- [ ] Guia de contribuição para novos adaptadores, com testes de contrato.

**Conclusão:** uma pessoa de fora consegue adicionar um adaptador seguindo o
guia, e os adaptadores prioritários passam em instância real.

### R3 — Acesso, alcance e personalização

- [ ] Login OIDC opcional e acesso de convidado somente leitura.
- [ ] Cenários de rede suportados (P2) fechados e documentados antes de
      anunciar acesso fora do loopback.
- [ ] Temas, CSS próprio, imagem de fundo e cards translúcidos, e várias
      páginas ou abas.
- [ ] Atalhos de teclado e busca web opcional (mecanismo configurável, sem
      enviar dados do Homora).

**Conclusão:** modelo de acesso validado e documentado; instância usável por
mais de uma pessoa sem compartilhar a conta de administrador.

### R4 — Diferencial: agentes com aprovação

- [ ] Agentes propondo widgets, integrações e sugestões de descoberta, sempre
      como proposta revisável com diff e auditoria.
- [ ] Validação visual e sob carga do fluxo de propostas (pendente em P4).
- [ ] Mapa serviço → máquina com Proxmox: associação manual e sugestões com
      evidência, sem deduzir só pelo nome.
- [ ] Demonstração pública e texto de posicionamento verificável: o que o
      agente pode e não pode fazer.

**Conclusão:** o diferencial é demonstrável por quem não leu o código.

## Caso de referência: migrar um Homepage real (2026-11-10)

Origem: uma captura de tela de um Homepage em uso por quem mantém o projeto
(homelab pessoal com Proxmox, DNS, VPN, mídia e segurança). Serve de critério
prático para a pergunta "dá para migrar para o Homora?". A captura mostra o
resultado visual; **não** foi possível conhecer a configuração por trás dela,
então a lista abaixo é inferida e deve ser conferida com o `services.yaml` e
o `widgets.yaml` reais antes de virar escopo.

| O que a página tem                                                     | Situação no Homora                                                  | Fase |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ---- |
| Grupos de cards com descrição e busca                                  | Existe                                                              | —    |
| Status de disponibilidade por serviço                                  | Existe; estados semânticos pendentes                                | R1   |
| Dados do serviço dentro do card (VMs, LXC, CPU, MEM, consultas, sites) | Não: os widgets ficam numa área separada da página Integrações      | R1   |
| Logos de marca por nome (Proxmox, Portainer, Vaultwarden…)             | Não: só emoji, `lucide:` genérico e URL                             | R1   |
| Colunas com larguras diferentes                                        | Parcial: número de colunas por grupo; cards com larguras livres não | R1   |
| Faixa superior com CPU, memória, disco, data e hora                    | Não                                                                 | R1   |
| Integrações Proxmox, Uptime Kuma, AdGuard, Home Assistant              | Existem (somente leitura, validadas só com mocks)                   | R2   |
| Portainer, Cloudflare, Tailscale, Netbird, TrueNAS, Beszel, Speedtest  | Não existem                                                         | R2   |
| Imagem de fundo, cards translúcidos, cores                             | Não                                                                 | R3   |
| Busca que abre um buscador web (botão "G")                             | Não: a busca só filtra os cards                                     | R3   |
| Importar o `services.yaml`                                             | Existe, mas sem widgets                                             | R0   |

Ordem sugerida, do que mais muda a percepção ao que mais custa:

1. Widgets dentro do card, ligados a uma conexão existente. Sem isso, novas
   integrações têm pouco valor visível.
2. Ícones de marca por nome (barato e muda muito a aparência).
3. Colunas e faixa superior.
4. Integrações, na ordem de uso real de quem migra.
5. Tema e fundo.

O que o caso **não** deve mudar: a descoberta por Docker e qualquer execução de
comandos no host continuam condicionadas ao desenho do Homora (uso local,
privilégio mínimo, agentes que só propõem). Chaves de API (por exemplo
Cloudflare e TrueNAS) usam o cofre de credenciais já existente.

**Conclusão do caso:** a página de referência é reproduzida no Homora, com os
mesmos serviços e os dados principais visíveis, sem editar arquivos à mão e sem
perder a verificação de TLS nem a política de destinos.

## Riscos

- Escopo: as fases superam a capacidade de um mantenedor solo; tratar R0 e R1
  como o mínimo para competir e adiar R3 e R4 se necessário.
- Paridade percebida: sem integrações validadas, um catálogo grande vira dívida.
  Prefira poucas integrações boas.
- Importadores dependem de formatos de terceiros que mudam; limitar a versões
  testadas e falhar com mensagem clara.
- Descoberta Docker exige acesso ao socket; manter somente leitura, revisão
  humana e documentar o risco.
- Não afirmar superioridade sobre Homepage ou Dashy antes de validar os itens
  acima com usuários reais.

## Como acompanhar

Quando uma fase for iniciada, transforme seus itens em tarefas em
[evolucao.md](evolucao.md), com as mesmas regras de conclusão: um item só é
marcado com evidência da implementação e da validação.

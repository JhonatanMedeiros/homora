# Plano de entrega

Este documento registra a visão geral das fases (checklist atualizado em 2026-11-10; a direção posterior está em [estratégia](estrategia.md)). Para a sequência priorizada, o
estado atual e os critérios de conclusão de cada etapa, consulte o
[plano de evolução](evolucao.md).

## Fase 0 — validação

- [x] Avaliar dashboards existentes e registrar lacunas reais em
      [avaliação de produto e concorrência](avaliacao-produto.md); a hipótese de
      posicionamento ainda precisa ser validada com usuários.
- [ ] Definir nome final, público e exemplos de uso; verificar disponibilidade do nome e marca.
- [x] Escolher stack (Fastify, React, SQLite), formato de distribuição (Docker
      Compose) e modelo de autenticação (conta local) após protótipo técnico.

## Fase 1 — fundação

- [x] Criar estrutura do projeto, desenvolvimento local, formatação, análise estática e CI.
- [x] Implementar autenticação, persistência, migrações, backup e restauração.
- [ ] Modelar serviços e grupos (feito); interface responsiva e acessível (feita,
      mas sem validação com leitor de tela e aparelho móvel real; ver P1).
- [x] Testar operações, persistência, acesso não autorizado e restauração.

## Fase 2 — observabilidade e Proxmox

- [x] Implementar verificação periódica com limites, cache e indicação de atualização.
- [ ] Criar adaptador Proxmox com token de leitura e validação TLS (implementado;
      conexão com CA importada funcionou no ambiente do mantenedor, permissões
      reduzidas e falhas ainda não validadas).
- [ ] Exibir inventário (feito) e oferecer sugestões revisáveis (pendente), sem modificar infraestrutura.
- [ ] Testar indisponibilidade, credenciais inválidas, permissões reduzidas e proteção de destinos
      (proteção de destinos testada; o restante depende de Proxmox real).

## Fase 3 — MCP e aprovação

Implementada: agentes têm identidade, escopos e revogação; o MCP oferece
consultas e propostas; a interface revisa propostas com diff e expiração; e a
aplicação registra auditoria sob transação. A validação visual manual,
concorrência sob carga e injeção em respostas reais continuam pendentes; veja o
[plano de evolução](evolucao.md) para o estado atualizado.

## Fase 4 — distribuição e validação

- [ ] Documentar instalação, configuração, recuperação, atualização e limitações.
- [ ] Criar imagem reproduzível e testar instalação limpa e upgrade preservando dados.
- [ ] Validar os critérios do MVP com um ambiente real e registrar melhorias.
- [ ] Avaliar script de instalação para Proxmox e integrações adicionais conforme demanda.

## Riscos e decisões abertas

Descoberta pode produzir sugestões incorretas; integração precisa de confirmação. Verificações de URLs internas aumentam a superfície de SSRF; definir política de destinos antes de implementá-las. Perda da chave de criptografia pode impedir recuperação de credenciais; documentar backup e rotação. Modelo de acesso remoto, identidade MCP e armazenamento de segredos exigem prova de conceito antes da implementação definitiva. Não há estimativas de prazo sem conhecer disponibilidade e requisitos adicionais.

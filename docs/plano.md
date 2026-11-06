# Plano de entrega

## Fase 0 — validação

- [ ] Avaliar dashboards existentes e registrar lacunas reais.
- [ ] Definir nome final, público e exemplos de uso; verificar disponibilidade do nome e marca.
- [ ] Escolher stack, formato de distribuição e modelo de autenticação após protótipo técnico.

## Fase 1 — fundação

- [ ] Criar estrutura do projeto, desenvolvimento local, formatação, análise estática e CI.
- [ ] Implementar autenticação, persistência, migrações, backup e restauração.
- [ ] Modelar serviços e grupos; criar interface responsiva e acessível.
- [ ] Testar operações, persistência, acesso não autorizado e restauração.

## Fase 2 — observabilidade e Proxmox

- [ ] Implementar verificação periódica com limites, cache e indicação de atualização.
- [ ] Criar adaptador Proxmox com token de leitura e validação TLS.
- [ ] Exibir inventário e oferecer sugestões revisáveis, sem modificar infraestrutura.
- [ ] Testar indisponibilidade, credenciais inválidas, permissões reduzidas e proteção de destinos.

## Fase 3 — MCP e aprovação

- [ ] Implementar identidade, escopos e revogação para agentes.
- [ ] Disponibilizar ferramentas de leitura e proposta de alterações de cards.
- [ ] Criar tela de revisão com diff, expiração, controle de concorrência e aplicação transacional.
- [ ] Auditar tentativas e testar autorização, repetição, expiração e injeção de instruções em dados externos.

## Fase 4 — distribuição e validação

- [ ] Documentar instalação, configuração, recuperação, atualização e limitações.
- [ ] Criar imagem reproduzível e testar instalação limpa e upgrade preservando dados.
- [ ] Validar os critérios do MVP com um ambiente real e registrar melhorias.
- [ ] Avaliar script de instalação para Proxmox e integrações adicionais conforme demanda.

## Riscos e decisões abertas

Descoberta pode produzir sugestões incorretas; integração precisa de confirmação. Verificações de URLs internas aumentam a superfície de SSRF; definir política de destinos antes de implementá-las. Perda da chave de criptografia pode impedir recuperação de credenciais; documentar backup e rotação. Modelo de acesso remoto, identidade MCP e armazenamento de segredos exigem prova de conceito antes da implementação definitiva. Não há estimativas de prazo sem conhecer disponibilidade e requisitos adicionais.

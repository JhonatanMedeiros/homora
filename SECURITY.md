# Segurança

Homora está em desenvolvimento e é destinado a acesso local. A interface e a
API não estão preparadas para exposição pública ou acesso remoto seguro. O
Docker Compose vincula a interface a `127.0.0.1`; não altere esse limite nem
coloque a aplicação atrás de um proxy público esperando que ela forneça HTTPS,
proteção contra CSRF ou um modelo de acesso remoto.

## Relatar uma vulnerabilidade

Não publique detalhes de uma falha ainda não corrigida em issues ou discussões
públicas. Se o repositório oferecer GitHub Security Advisories, use um relato
privado por esse canal. Caso contrário, procure um canal privado dos
mantenedores antes de enviar detalhes; não há atualmente um endereço de contato
de segurança documentado. Inclua versões afetadas, impacto e passos mínimos de
reprodução, sem dados ou credenciais reais. Não há SLA de resposta ou política
de recompensa estabelecidos.

## Cuidados conhecidos

- Mantenha `.env`, `data/`, arquivos `.auth`, `.key` e `.proxmox` fora de
  controle de versão e com acesso restrito. Caminhos personalizados também
  precisam ser protegidos.
- O banco pode conter credenciais cifradas; a chave `.key` permite decifrá-las.
  Proteja e armazene cópias de segurança separadamente. Sem essa chave, será
  necessário cadastrar credenciais novamente.
- O MCP é um processo local de leitura que acessa banco e chave diretamente.
  A sessão web não o protege; use apenas com cliente e usuário do sistema
  confiáveis.
- Use credenciais de integração com privilégio mínimo e valide certificados
  TLS. Não desative a validação TLS.
- O monitoramento de serviços bloqueia destinos RFC1918 e ULA por padrão. Um
  usuário autenticado pode habilitar o acesso privado em cada serviço; isso
  autoriza somente essas faixas na origem exata configurada. DNS é fixado para
  a conexão e respostas mistas, faixas especiais e redirecionamentos continuam
  bloqueados. A lista de faixas especiais não cobre toda política de rede local.
- Trate nomes, URLs e respostas de integrações como dados não confiáveis.

Consulte o [README](README.md) para backup e recuperação e
[arquitetura](docs/arquitetura.md) para os riscos e controles planejados. Os
controles descritos como planejados ainda não devem ser presumidos como
implementados.

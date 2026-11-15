# Descoberta Docker

A descoberta sugere cartões a partir de labels de contêineres em execução. Ela começa desativada e nunca adiciona serviços sem sua revisão e confirmação.

```yaml
services:
  jellyfin:
    labels:
      homora.url: http://192.168.1.10:8096
      homora.name: Jellyfin
      homora.group: Media
      homora.icon: brand:jellyfin
```

`homora.url` identifica o endereço; nome, grupo, descrição e ícone são opcionais. As labels `homepage.href`, `homepage.name`, `homepage.group`, `homepage.description` e `homepage.icon` também são reconhecidas; `homora.*` tem prioridade. Labels não autorizam monitoramento da rede privada automaticamente.

Revise cada sugestão, ajuste nome, grupo e endereço quando necessário e confirme a importação. O endereço é uma sugestão e pode não estar acessível no navegador. Se o inventário ou a configuração mudar durante a revisão, revise novamente.

## Hosts remotos

É possível criar fontes remotas e usar o agente de descoberta opcional em hosts confiáveis. O token é exibido uma vez e deve ser protegido; revogar uma fonte invalida seu token. O acesso ao Docker deve usar a configuração restrita documentada, com HTTPS e validação de certificado para conexões remotas.

O acesso ao socket Docker é sensível. Consulte os comandos, opções, configuração do proxy e diagnóstico no [guia completo em inglês](/user-guide/docker-discovery) antes de habilitar a descoberta.

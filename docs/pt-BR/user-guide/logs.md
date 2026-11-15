# Logs e verificação de saúde

O Homora escreve logs estruturados em JSON na saída do contêiner. Em uma instalação Compose, consulte-os com:

```bash
docker compose logs backend
```

`HOMORA_LOG_LEVEL` controla o nível de detalhe. Os logs ajudam a investigar inicialização, monitoramento, autenticação e integrações; não devem conter tokens, senhas ou credenciais. Antes de compartilhar um relato, revise a saída e remova informações do seu ambiente.

O endpoint `/api/health` é usado pela verificação de saúde do contêiner. Uma resposta de saúde da aplicação não garante que todos os serviços monitorados estejam disponíveis.

[Leia os campos, níveis e exemplos completos em inglês](/user-guide/logs).

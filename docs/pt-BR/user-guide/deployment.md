# Instalação e atualizações

O Homora foi projetado para uso em uma máquina ou rede sob seu controle. O acesso direto pela internet não é suportado.

## Instalar com Docker Compose

```bash
git clone https://github.com/JhonatanMedeiros/homora.git
cd homora
docker compose up -d --build
```

Acesse <http://localhost:8080> e crie a conta administradora. Por padrão, a porta é vinculada a `127.0.0.1` e os dados ficam no volume `homora-data`. Faça a primeira configuração na própria máquina: antes de criar a conta, qualquer pessoa com acesso à porta pode criá-la.

Quando as imagens de release estiverem disponíveis, também será possível usar a imagem única da aplicação:

```bash
docker run -d --name homora --restart unless-stopped \
  -p 127.0.0.1:8080:8080 -v homora-data:/app/data \
  ghcr.io/jhonatanmedeiros/homora:latest
```

A imagem reúne interface e backend; o agente remoto de descoberta Docker é opcional e separado. A tag `latest` pode mudar: escolha uma versão explícita quando precisar de reprodutibilidade.

## Rede privada

O acesso pela própria máquina é o cenário padrão. HTTP de outros dispositivos não é suportado. Para acesso por outros dispositivos na rede privada, use um proxy reverso HTTPS e configure as origens e proxies confiáveis conforme o [guia completo em inglês](/user-guide/deployment). Esse arranjo foi validado uma vez com nginx local e certificado próprio; não torna a exposição pública segura.

## Atualizar

1. Faça e teste um [backup](import-export-backup.md).
2. Atualize o checkout ou escolha a nova versão da imagem.
3. Execute o Compose correspondente. O volume é preservado e migrações são executadas na inicialização.

Não há downgrade automático. Em caso de falha, preserve o volume original e restaure o backup em uma cópia de trabalho. O [guia completo em inglês](/user-guide/deployment) inclui instruções para o proxy e a migração da instalação antiga de dois contêineres.

# Integrações e widgets

Integrações são opcionais e permitem exibir dados de serviços externos. As consultas são de leitura; Homora não altera a infraestrutura por meio delas. Uma **conexão** guarda o endereço e as credenciais de um serviço. Um **widget** apresenta dados dessa conexão em um cartão ou em uma página.

![Página de integrações](../../screenshots/integrations.png)

## Adicione uma conexão

1. Abra **Gerenciar → Integrações** e escolha adicionar uma conexão.
2. Selecione o tipo e preencha endereço e credenciais. Prefira uma conta ou token somente de leitura.
3. Autorize rede privada quando necessário. Para uma autoridade certificadora privada, informe apenas o certificado público PEM.
4. Salve e teste. O cartão informa o resultado e a causa de uma falha.

A conexão é feita pelo backend, portanto o endereço precisa ser acessível a partir de onde o Homora roda. `localhost` dentro de um contêiner aponta para o próprio contêiner. Conexões autenticadas exigem HTTPS e validação de certificado; não desative TLS para contornar erros.

## Widgets

Na aba de widgets, escolha o tipo, a conexão e o cartão. Widgets de página podem ser adicionados no dashboard; o relógio e a nota não exigem conexão. A nota aceita até 4.000 caracteres de Markdown básico: parágrafos, quebras de linha, negrito, itálico, listas e links HTTP(S). Ela pode ter um nome opcional e acompanha as exportações da configuração. HTML, imagens, tabelas e blocos de código não são exibidos como tais. A barra superior opcional pode mostrar data, hora e dados de uma conexão Proxmox.

As integrações incluem Proxmox, Jellyfin, Home Assistant e outras. A cobertura e a validação ao vivo variam; consulte a [referência de integrações em inglês](/integrations) antes de depender de uma integração específica.

Para criar uma integração, siga o [guia do SDK em inglês](/adapters). Para contêineres, veja [descoberta Docker](docker-discovery.md).

[Leia o guia completo de integrações e widgets em inglês](/user-guide/integrations-and-widgets).

## Contagem regressiva

Adicione o widget de página **Contagem regressiva** para um evento. Informe nome, data e hora locais e escolha um fuso IANA ou o fuso do navegador. O contador atualiza a cada minuto enquanto a aba está visível. Após o evento, ele permanece visível em texto atenuado por padrão; selecione **Ocultar automaticamente** para escondê-lo. Widgets ocultos permanecem salvos; use **Gerenciar contagens ocultas** para editá-los ou removê-los. Cada evento usa um widget.

Se uma mudança de horário tornar a hora ambígua, vale a primeira ocorrência. Se a hora não existir, ela avança pelo intervalo da mudança. A data e hora resolvidas ficam visíveis; o contador não anuncia cada minuto. Contagens são incluídas na exportação e importação sem conexão.

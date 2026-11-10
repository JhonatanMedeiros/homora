# Avisos de terceiros

O Homora é distribuído sob a licença MIT (veja [LICENSE](LICENSE)). Este
arquivo resume as licenças das dependências de produção, conforme
`pnpm licenses list --prod` em 2026-11-10. Reexecute o comando ao atualizar
dependências; o texto completo de cada licença acompanha o pacote
correspondente em `node_modules`.

| Licença      | Pacotes                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| MIT e ISC    | A grande maioria das dependências, incluindo `yaml` (ISC).                  |
| Apache-2.0   | `class-variance-authority`, `detect-libc`, `drizzle-orm`                    |
| BSD-3-Clause | `fast-uri`, `light-my-request`, `qs`, `secure-json-parse`, `source-map-js`  |
| BSD-2-Clause | `json-schema-typed`                                                         |
| 0BSD         | `tslib`                                                                     |
| MPL-2.0      | `lightningcss` (ferramenta de build do CSS; não é executada em produção)    |
| OFL-1.1      | Fontes Figtree, JetBrains Mono e Barlow Semi Condensed (pacotes Fontsource) |

## Ícones

Os ícones `lucide:nome` vêm do pacote `lucide-react` (licença ISC), já listado acima.
Ícones por URL são de responsabilidade de quem os configura.

Os logos `brand:nome` (163 arquivos SVG em `apps/frontend/public/brand-icons`)
vêm do projeto [dashboard-icons](https://github.com/homarr-labs/dashboard-icons)
(licença Apache-2.0, texto em `licenses/dashboard-icons-Apache-2.0.txt`),
copiados do commit `d767d73`. Foram escolhidos apenas SVG vetoriais, sem
imagens embutidas, scripts ou referências externas (um teste verifica isso).
Nomes de produtos, marcas e logos pertencem a seus donos e aparecem somente para
identificar o serviço, sem sugerir apoio ou parceria; a licença Apache-2.0 do
repositório não concede direitos sobre marcas de terceiros.

## Fontes

As fontes são servidas localmente pelos pacotes Fontsource, sob a SIL Open Font
License 1.1. Essa licença permite uso e redistribuição, inclusive com o
software, desde que a licença e os avisos de copyright acompanhem as fontes e
que elas não sejam vendidas isoladamente. Os arquivos de licença estão nos
pacotes `@fontsource*`.

## Pendências

- A imagem Docker publicada deve incluir este arquivo e as licenças das
  fontes. Isso será tratado junto da imagem reproduzível (R0).
- A revisão cobriu dependências de produção, fontes e os logos de marca do
  dashboard-icons (apenas pela licença do repositório; não foi feita revisão de
  cada marca). Outros assets futuros exigem revisão própria.
- Não foi feita análise jurídica; a checagem de nome e marca segue pendente.

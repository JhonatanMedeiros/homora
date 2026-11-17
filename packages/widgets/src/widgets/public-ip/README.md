# public-ip

Page widget (`version: 1`, `normal` size, `portable: true`) displaying the server's current public IPv4/IPv6 address from a built-in HTTPS provider (`ipify` or `icanhazip`) with explicit opt-in and `maskByDefault` privacy controls.

- Definition & config validation: `definition.ts`
- IPv4/IPv6 validation, RFC 5952 normalization & masking: `ip.ts`
- Source reader (`public-ip` contract): `source.ts` (registered in `packages/widgets/src/source-registry.ts`)
- UI & editor: `ui/index.tsx`, `ui/use-public-ip-reading.ts`
- Translations (`en`, `pt-BR`): `messages.ts`

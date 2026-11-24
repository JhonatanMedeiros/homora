# Changelog

## [0.5.0](https://github.com/JhonatanMedeiros/homora/compare/v0.4.0...v0.5.0) (2026-11-24)


### 🚀 New features

* add certificate expiry widget ([#304](https://github.com/JhonatanMedeiros/homora/issues/304)) ([63e610e](https://github.com/JhonatanMedeiros/homora/commit/63e610ebc0344769eb4e2a2717e91c143cc26387))
* add maintenance schedule widget ([#303](https://github.com/JhonatanMedeiros/homora/issues/303)) ([47a324d](https://github.com/JhonatanMedeiros/homora/commit/47a324d450c72a17ce712d446c707bbe6c5d415b))
* add service latency history widget ([#305](https://github.com/JhonatanMedeiros/homora/issues/305)) ([e132322](https://github.com/JhonatanMedeiros/homora/commit/e132322b11f602ea3e8a4e572a1e498556828413))
* **connections:** keep the connection dialog compact and scrollable ([#327](https://github.com/JhonatanMedeiros/homora/issues/327)) ([c67fd72](https://github.com/JhonatanMedeiros/homora/commit/c67fd72be8ec8366a9637edff466471aca1c20f8))
* **integrations:** add TP-Link Omada Controller integration and network widget ([#324](https://github.com/JhonatanMedeiros/homora/issues/324)) ([0edd23d](https://github.com/JhonatanMedeiros/homora/commit/0edd23d5168c6129a6c2d91d930cf73ccb9e366e))
* **integrations:** add weather source contract and multi-provider support ([#289](https://github.com/JhonatanMedeiros/homora/issues/289)) ([6b2bc78](https://github.com/JhonatanMedeiros/homora/commit/6b2bc78ea528fbec62bee03049475846ce39a07b))
* **integrations:** document CA and internal host mapping for self-signed controllers ([#328](https://github.com/JhonatanMedeiros/homora/issues/328)) ([de24847](https://github.com/JhonatanMedeiros/homora/commit/de248473fed9118a8d8af304308c37b8148817cf)), closes [#326](https://github.com/JhonatanMedeiros/homora/issues/326)
* **notifications:** redesign the bell popup ([#322](https://github.com/JhonatanMedeiros/homora/issues/322)) ([13ae0f8](https://github.com/JhonatanMedeiros/homora/commit/13ae0f8a3d3ddcf59e287e148df019b47169a4ef))
* **ui:** use the attachment component for file fields ([#331](https://github.com/JhonatanMedeiros/homora/issues/331)) ([52ac6bb](https://github.com/JhonatanMedeiros/homora/commit/52ac6bb764deddefb0c26da30d2dff2086bbfac0))
* **widgets:** add a Coolify resources widget (INT-04) ([#320](https://github.com/JhonatanMedeiros/homora/issues/320)) ([8aee2a3](https://github.com/JhonatanMedeiros/homora/commit/8aee2a32b08d7b44408d064f482f9839a8fcd59b))
* **widgets:** add an Uptime Kuma monitor states widget (INT-03) ([#318](https://github.com/JhonatanMedeiros/homora/issues/318)) ([bd259a6](https://github.com/JhonatanMedeiros/homora/commit/bd259a652bc7e25ca8b45a836eb2203f4c5f3cc1))
* **widgets:** add availability widget (MON-04) ([#296](https://github.com/JhonatanMedeiros/homora/issues/296)) ([#299](https://github.com/JhonatanMedeiros/homora/issues/299)) ([086bfc2](https://github.com/JhonatanMedeiros/homora/commit/086bfc27f6bc744d221a5fc54568f673b0076759))
* **widgets:** add current weather and short forecast widget ([#290](https://github.com/JhonatanMedeiros/homora/issues/290)) ([ad03ced](https://github.com/JhonatanMedeiros/homora/commit/ad03cedc6bcef1c64f87e83905eed80301a3d271))
* **widgets:** add domain-expiry widget (EXT-05) ([#294](https://github.com/JhonatanMedeiros/homora/issues/294)) ([72fd5a6](https://github.com/JhonatanMedeiros/homora/commit/72fd5a6025897ec88873494f0c2c04f803ae1974))
* **widgets:** add public IP address widget ([#295](https://github.com/JhonatanMedeiros/homora/issues/295)) ([8d072a8](https://github.com/JhonatanMedeiros/homora/commit/8d072a8cfd9c1979b6379273e882d372813c6cdb))
* **widgets:** add quick links widget ([#298](https://github.com/JhonatanMedeiros/homora/issues/298)) ([52754f3](https://github.com/JhonatanMedeiros/homora/commit/52754f31214245c816849f95003e7b48312ad06b))
* **widgets:** add RSS/Atom feed widget ([#286](https://github.com/JhonatanMedeiros/homora/issues/286)) ([168aca7](https://github.com/JhonatanMedeiros/homora/commit/168aca7f2ed64e9846da5c2602f9d7bb2fc43a9f))
* **widgets:** improve widget gallery and add live preview in dialog ([#291](https://github.com/JhonatanMedeiros/homora/issues/291)) ([ad0a990](https://github.com/JhonatanMedeiros/homora/commit/ad0a99006ccc9af35dc452f41c9412cef42cf6e4))


### 🩹 Bug fixes

* **compose:** honor HOMORA_EXTRA_HOST in the main compose file ([#329](https://github.com/JhonatanMedeiros/homora/issues/329)) ([f1d605d](https://github.com/JhonatanMedeiros/homora/commit/f1d605d2c016e4362c15c939474660d3386dab1f))
* **connections:** authorize private networks explicitly and report a clear reason ([#334](https://github.com/JhonatanMedeiros/homora/issues/334)) ([18d63a6](https://github.com/JhonatanMedeiros/homora/commit/18d63a60b7391f371dc7657f40c1f0a5a37b7492))
* harden monitoring TLS, error handling, SQLite concurrency, and clean up dead code and docs ([#284](https://github.com/JhonatanMedeiros/homora/issues/284)) ([caab2f4](https://github.com/JhonatanMedeiros/homora/commit/caab2f45c75fc7b6890b6a751c838d1847e7f878))
* make probe dialog scrollable with fixed header and footer ([#311](https://github.com/JhonatanMedeiros/homora/issues/311)) ([d244b6d](https://github.com/JhonatanMedeiros/homora/commit/d244b6ded5f9ad7bca91e2a57e3d09956e4a8363))
* match widget skeleton to card layout ([#316](https://github.com/JhonatanMedeiros/homora/issues/316)) ([ab77432](https://github.com/JhonatanMedeiros/homora/commit/ab7743235b81e1ac8197ccb107d0e9f8ea04654e))
* **ui:** center the Pi-hole icon and add the Omada brand icon ([#333](https://github.com/JhonatanMedeiros/homora/issues/333)) ([6fedd7b](https://github.com/JhonatanMedeiros/homora/commit/6fedd7b17fb1ff7416a5e227f37f7e5a32646ef5))
* **ui:** restore pointer cursor on interactive controls ([#325](https://github.com/JhonatanMedeiros/homora/issues/325)) ([d7fa389](https://github.com/JhonatanMedeiros/homora/commit/d7fa38934dfa9f10c29cc661f76e3e9ace84443e))
* **widgets:** validate quick link URLs before submit ([#319](https://github.com/JhonatanMedeiros/homora/issues/319)) ([5eac190](https://github.com/JhonatanMedeiros/homora/commit/5eac1902242aead45d2ad399f4cbd5f8145055da))


### 🧩 Dependencies

* bump nginx from 1.27-alpine to 1.29-alpine ([#306](https://github.com/JhonatanMedeiros/homora/issues/306)) ([67e1547](https://github.com/JhonatanMedeiros/homora/commit/67e1547a9d1fa9c84bcd334965d7cc2db09afb39))
* bump the minor-and-patch group with 12 updates ([#308](https://github.com/JhonatanMedeiros/homora/issues/308)) ([ea75b5d](https://github.com/JhonatanMedeiros/homora/commit/ea75b5d9db9109ba97f2433ae89532fd2c881fd8))


### 📝 Documentation

* add a widget gallery and tighten the user guide ([#330](https://github.com/JhonatanMedeiros/homora/issues/330)) ([204c9c5](https://github.com/JhonatanMedeiros/homora/commit/204c9c5d453bf6826239e505383b59f19af11ed6))

## [0.4.0](https://github.com/JhonatanMedeiros/homora/compare/v0.3.0...v0.4.0) (2026-11-17)


### 🚀 New features

* add countdown page widget ([#264](https://github.com/JhonatanMedeiros/homora/issues/264)) ([e33b2f7](https://github.com/JhonatanMedeiros/homora/commit/e33b2f7ff04e026c7b866588fad1840f44df6e3a))
* add current problems widget ([#277](https://github.com/JhonatanMedeiros/homora/issues/277)) ([eb3bf86](https://github.com/JhonatanMedeiros/homora/commit/eb3bf86fac52b9d9f7eedae5575db158cdd46966))
* add homelab status summary widget ([#275](https://github.com/JhonatanMedeiros/homora/issues/275)) ([683b6f2](https://github.com/JhonatanMedeiros/homora/commit/683b6f203d7ad1abf7a70d5e557b89277cc27b6c))
* add internal monitoring sources for widgets ([#274](https://github.com/JhonatanMedeiros/homora/issues/274)) ([efbbc0d](https://github.com/JhonatanMedeiros/homora/commit/efbbc0dafa7fd47077a4e92281334f09be3fc80d))
* add monthly calendar widget ([#273](https://github.com/JhonatanMedeiros/homora/issues/273)) ([f1446d9](https://github.com/JhonatanMedeiros/homora/commit/f1446d9cbca8a01b18d48c9755a2fb6ecf99a4e7))
* add recent incidents widget ([#276](https://github.com/JhonatanMedeiros/homora/issues/276)) ([b93c2f9](https://github.com/JhonatanMedeiros/homora/commit/b93c2f9c2ba1ed16bb6aef0e6a368addfa49a402))
* add widget scaffolding and enforce module boundaries ([#271](https://github.com/JhonatanMedeiros/homora/issues/271)) ([f79aad1](https://github.com/JhonatanMedeiros/homora/commit/f79aad1f8be0025f12f75dc281a848f8f20e1719))
* center command palette search bar in header and improve page overflow navigation ([#280](https://github.com/JhonatanMedeiros/homora/issues/280)) ([4493ea7](https://github.com/JhonatanMedeiros/homora/commit/4493ea7ad301151e7fe0498551af3b3158e46afb))
* extract @homora/utils package and consolidate shared contracts ([#278](https://github.com/JhonatanMedeiros/homora/issues/278)) ([a199aae](https://github.com/JhonatanMedeiros/homora/commit/a199aae7ac83c367d8b1906fa9a5aa374c4213a2))
* improve monitoring notification messages ([#253](https://github.com/JhonatanMedeiros/homora/issues/253)) ([f9a2b94](https://github.com/JhonatanMedeiros/homora/commit/f9a2b94467f1a318ec50d4951dc289a7b87288a1))
* move multi-page navigation into the app header ([#279](https://github.com/JhonatanMedeiros/homora/issues/279)) ([65e8b2e](https://github.com/JhonatanMedeiros/homora/commit/65e8b2e8d68bfe3de2c257a126a2123adbb0017c))
* support wide page widgets ([#272](https://github.com/JhonatanMedeiros/homora/issues/272)) ([1f217f5](https://github.com/JhonatanMedeiros/homora/commit/1f217f56efb63c4fe4165146e53dd4fa9f5b07ae))
* **widgets:** add Markdown notes to dashboard pages ([#262](https://github.com/JhonatanMedeiros/homora/issues/262)) ([96fbafc](https://github.com/JhonatanMedeiros/homora/commit/96fbafcbcd9468f3fd734c35119916cbf621120e))


### 📝 Documentation

* clarify pull request title conventions ([#254](https://github.com/JhonatanMedeiros/homora/issues/254)) ([a9ae663](https://github.com/JhonatanMedeiros/homora/commit/a9ae6639ebe6526e6a44086c5afde3d96519997f))
* link widget catalog items to their issues ([#268](https://github.com/JhonatanMedeiros/homora/issues/268)) ([c890da9](https://github.com/JhonatanMedeiros/homora/commit/c890da9cd517bad0e4aaeb7d6a5e6c04545d2f7b))


### 🧰 Improvements

* extract shared shadcn UI package ([#269](https://github.com/JhonatanMedeiros/homora/issues/269)) ([7b0af70](https://github.com/JhonatanMedeiros/homora/commit/7b0af706822862ac636e6ac168ed27c59a755ff5))
* isolate page widget modules ([#270](https://github.com/JhonatanMedeiros/homora/issues/270)) ([d28badc](https://github.com/JhonatanMedeiros/homora/commit/d28badcc65f8697e057982171f184f6364801446))

## [0.3.0](https://github.com/JhonatanMedeiros/homora/compare/v0.2.0...v0.3.0) (2026-11-16)


### 🚀 New features

* move Home health into a header pill and list hosts in the rail ([#251](https://github.com/JhonatanMedeiros/homora/issues/251)) ([dbd194a](https://github.com/JhonatanMedeiros/homora/commit/dbd194a7152cfa5fc7b76dc15bffd4615f5bacbb))


### 🩹 Bug fixes

* override vulnerable build dependencies ([#248](https://github.com/JhonatanMedeiros/homora/issues/248)) ([b4f8399](https://github.com/JhonatanMedeiros/homora/commit/b4f8399f30add388382d94ea40051797e968dbee))

## [0.2.0](https://github.com/JhonatanMedeiros/homora/compare/v0.1.1...v0.2.0) (2026-11-16)


### 🚀 New features

* add the Healthchecks integration ([#243](https://github.com/JhonatanMedeiros/homora/issues/243)) ([25615a5](https://github.com/JhonatanMedeiros/homora/commit/25615a5b247f267c2454f2500de827e382b8807d))


### 📝 Documentation

* describe the published release image as available ([#244](https://github.com/JhonatanMedeiros/homora/issues/244)) ([495734d](https://github.com/JhonatanMedeiros/homora/commit/495734de13c37bf6cbaa15db16c2e1d957b7cf07))

## [0.1.1](https://github.com/JhonatanMedeiros/homora/compare/v0.1.0...v0.1.1) (2026-11-15)


### 📝 Documentation

* add site metadata and link the published documentation ([#234](https://github.com/JhonatanMedeiros/homora/issues/234)) ([7153d77](https://github.com/JhonatanMedeiros/homora/commit/7153d7786f11357e69381359dcf5e2463f18425f))
* improve documentation site design and guides ([#232](https://github.com/JhonatanMedeiros/homora/issues/232)) ([c688f5e](https://github.com/JhonatanMedeiros/homora/commit/c688f5ecdedc13ee7fe9c89b1dd6f97ea81404d9))

## 0.1.0 (2026-11-15)

The first public Homora release brings your services, their health and your homelab tools together in a self-hosted dashboard. Proxmox and AI agents are optional: you can start with a simple collection of service links and add capabilities when you need them.

### 🚀 Highlights

- **A home for your services:** organize cards into groups and pages, find them with the command palette, customize the layout, and use built-in brand icons. See the [dashboard redesign](https://github.com/JhonatanMedeiros/homora/pull/183) ([commit](https://github.com/JhonatanMedeiros/homora/commit/ebd7f31d76e233d7e9e2ff3c7608ed65b86430cc)).
- **Monitoring and alerts:** check service availability, review latency and incident history, schedule maintenance, and send notifications. The notification inbox keeps service events visible in the app. See [notifications](https://github.com/JhonatanMedeiros/homora/pull/200) and [monitoring workflows](https://github.com/JhonatanMedeiros/homora/pull/199).
- **Integrations and widgets:** connect supported services using read-only integrations and display their information on cards or pages. Integration capabilities and live-service validation differ; consult the [integration reference](https://github.com/JhonatanMedeiros/homora/blob/main/docs/integrations.md). See the [integration SDK](https://github.com/JhonatanMedeiros/homora/pull/107).
- **AI assistance with human review:** connect an agent over MCP with scoped tokens, then review its proposals before changes are applied. Agents do not write to external infrastructure. See [MCP transport](https://github.com/JhonatanMedeiros/homora/pull/43) and [proposal review](https://github.com/JhonatanMedeiros/homora/pull/218) ([commit](https://github.com/JhonatanMedeiros/homora/commit/c22fcc4342a5e2d89207f469e8747e02dd3e2bd6)).
- **Docker discovery:** review suggested service cards from container labels, including sources on trusted remote hosts. Discovery is optional and does not create cards without confirmation. See [remote discovery](https://github.com/JhonatanMedeiros/homora/pull/71) and [suggestion review](https://github.com/JhonatanMedeiros/homora/pull/225).
- **A single application image:** run the web interface and backend together; the remote Docker discovery agent remains a separate optional image. See [single-image distribution](https://github.com/JhonatanMedeiros/homora/pull/229) ([commit](https://github.com/JhonatanMedeiros/homora/commit/8b9bd1b6342407d877a87ae6c094f76a6f1b76c7)).

### 🔐 Account and security

The administrator account supports optional authenticator-based two-step verification and passkeys. Credentials for integrations are encrypted at rest, and access to private network destinations requires explicit authorization. See [two-step verification](https://github.com/JhonatanMedeiros/homora/pull/152) and [passkeys](https://github.com/JhonatanMedeiros/homora/pull/155).

Homora is in early development and intended for local access. Direct public internet exposure is not supported. Read the [deployment guide](https://github.com/JhonatanMedeiros/homora/blob/main/docs/user-guide/deployment.md) before enabling access from other devices.

### 📦 Getting started

After the release images are available, start Homora with Docker:

```bash
docker run -d --name homora --restart unless-stopped \
  -p 127.0.0.1:8080:8080 -v homora-data:/app/data \
  ghcr.io/jhonatanmedeiros/homora:0.1.0
```

Open `http://localhost:8080` on the same machine and create the administrator account. The named volume holds the database and its keys. Protect and back up the volume; see [backup and restore](https://github.com/JhonatanMedeiros/homora/blob/main/docs/user-guide/import-export-backup.md) and [getting started](https://github.com/JhonatanMedeiros/homora/blob/main/docs/user-guide/getting-started.md).

### 📝 Documentation and community

The repository includes user guides, integration references, contribution instructions and the source for a documentation site. The site uses English by default and includes Portuguese guides for the main workflows. See the [documentation and release work](https://github.com/JhonatanMedeiros/homora/pull/230).

### ↗️ Upgrading from a development installation

Back up the database and its associated keys before upgrading. Existing installations using the older two-container Compose setup should follow the migration steps in the [deployment guide](https://github.com/JhonatanMedeiros/homora/blob/main/docs/user-guide/deployment.md#upgrade); migration from an existing installation has not yet been validated. There is no automatic downgrade.

This initial release summarizes the current product rather than listing every historical change. For the full history, see the [commit history](https://github.com/JhonatanMedeiros/homora/commits/v0.1.0/).

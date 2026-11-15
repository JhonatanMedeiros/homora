# Changelog

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

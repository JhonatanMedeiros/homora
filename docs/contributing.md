# Contributing to Homora

Homora is open source, and contributions of all sizes are welcome. You can report a problem, suggest an improvement, improve the documentation, or propose code.

## Get started

1. Read the [contribution guide on GitHub](https://github.com/JhonatanMedeiros/homora/blob/main/CONTRIBUTING.md) for the development setup, checks, commit conventions and pull request process.
2. Review the [engineering standards](standards.md) and [architecture](architecture.md) for the area you plan to change.
3. For service integrations, follow the [integration SDK guide](adapters.md) and [integration reference](integrations.md).
4. For documentation updates, see [maintaining this site](maintainers/documentation.md).

Please follow the [code of conduct](https://github.com/JhonatanMedeiros/homora/blob/main/CODE_OF_CONDUCT.md). Report security vulnerabilities privately using the [security policy](https://github.com/JhonatanMedeiros/homora/blob/main/SECURITY.md), rather than opening a public issue.

The [product vision](product.md) and [evolution plan](evolution.md) provide context. The plan is a guide, and planned work is not necessarily implemented.

## AI agent skills

If you work with a coding agent, the repository includes optional skills for pull requests, integrations, widgets, database migrations and releases. See the [skill list in the contribution guide](https://github.com/JhonatanMedeiros/homora/blob/main/CONTRIBUTING.md#ai-agent-skills).

## Local widget contributions

Use `pnpm widget:create <type>` and follow the [widget creation guide](create-widget.md). Keep definition, logic, translations, tests and UI in the module; do not add widget-specific host branches. Future widget issues must account for the scaffold, module structure, compatibility and validation.

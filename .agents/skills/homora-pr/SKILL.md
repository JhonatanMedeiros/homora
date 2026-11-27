---
name: homora-pr
description: Prepare and open a Homora pull request, with validation, documentation checks and a Conventional Commit title. Use when asked to open, create or update a PR.
---

# Homora pull request

Read [AGENTS.md](../../../AGENTS.md) and [CONTRIBUTING.md](../../../CONTRIBUTING.md) first; they win
over this skill. Reply in the user's language; write commits and the PR in English.

Commit, push and open or edit a PR only when the user asked for it. Never merge it from this skill.

## 1. Scope

- `git status` and `git diff` against `origin/main`. Preserve unrelated and untracked work; stage
  only files that belong to the change, by name.
- Look for secrets, personal data, databases, backups and local settings in the diff.
- On `main`, create a branch named `<type>/<topic>`, matching the commit type.

## 2. Completeness

- Behavior changes have tests, including failure cases where the
  [standards](../../../docs/standards.md) require them.
- Changed installation, configuration, behavior or security is documented, in English and in
  `docs/pt-BR/`. Record anything left untranslated.
- Schema changes follow the `homora-migration` skill.
- Progress is marked in the [evolution plan](../../../docs/evolution.md) only with evidence.

## 3. Validate

- Run `pnpm check` and `pnpm build`; add `pnpm docs:build` if `docs/` changed. For a small change,
  targeted tests are acceptable: say which ran and which did not.
- Fix failures. Never use `--no-verify`, retry or skip a test, widen a timeout or raise a CI budget
  to get a green result.

## 4. Commit and open

- Title: a Conventional Commit that reads well as a changelog entry. Allowed types are in
  `commitlint.config.cjs`; which ones reach the changelog is set in `release-please-config.json`.
  Use `deps:` for dependencies and `security:` for security changes; mark breaking changes with `!`
  and explain the migration.
- The commit message on `main` drives the changelog. With a single commit, a squash merge may use
  that commit's subject instead of the PR title, so keep both aligned.
- Fill every section of [the PR template](../../../.github/pull_request_template.md): problem and
  solution; checks run with their results and what was not verified; compatibility, documentation,
  and screenshots with synthetic data for visible UI changes. Link the issue (`Closes #N`).
- Check for an existing PR (`gh pr view`) before creating one. Without push access, push to the
  user's fork.

## 5. Report

Give the PR link, the check results and the open limitations. If asked to follow CI, use
`gh pr checks`.

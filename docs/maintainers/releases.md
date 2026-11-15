# Releases

Homora uses short-lived branches and pull requests against `main`. A maintainer runs Release Please on demand to create or refresh a release PR from Conventional Commits. Merging that PR triggers a workflow that creates the GitHub release and tag, then calls the image workflow in the same Actions run. Review the version, changelog, compatibility and backup instructions before merging; security fixes do not need to wait for a batch of features.

## Prerequisites

- A repository-scoped `RELEASE_PLEASE_TOKEN` Actions secret with permission to write contents, pull requests and issues (labels), and read metadata. Use a fine-grained token with access only to this repository. The built-in `GITHUB_TOKEN` does not trigger CI on PRs it creates. A GitHub App requires a separate token-generation step; a short-lived installation token should not be stored as a static secret. Keep the credential outside the repository and rotate it according to the provider's guidance.
- Allow the token's owner to create pull requests and releases, and make sure required checks can run on its PRs. Check organizational policies and branch protection.
- Enable Actions and package publication. Verify GHCR package visibility independently of repository visibility.

## Workflow

1. Merge changes into `main` using Conventional Commit titles, for example `feat: add ...`, `fix: correct ...`, `security: harden ...` or `deps: update ...`; a breaking change uses `!` or a `BREAKING CHANGE:` footer. Pull request titles must survive the chosen merge method as Conventional Commit messages.
2. When ready to prepare a release, open **Actions → Prepare release → Run workflow**, select `main`, and run it. It creates or updates the release PR with changes accumulated since the last release. Ordinary merges into `main` do not refresh that PR; run the workflow again after any additional merges and before final review. Each manual refresh that changes the PR can trigger its CI checks.
3. Review the proposed version, changelog and release PR checks. Ensure `version.txt`, the backend package version and `.release-please-manifest.json` agree. Recheck curated notes after a refresh because Release Please may regenerate them.
4. Merge the release PR when ready. Release Please creates the tag and GitHub Release. The same workflow invokes the image workflow for that exact tag, so it does not rely on a second tag event. The image workflow verifies version consistency, tests, builds and publishes both images for amd64 and arm64. The application image embeds the release tag, letting its account menu link directly to that release.
5. Wait for both image jobs and check the packages are accessible, then test pulling the explicit version and the documented installation. A release page may appear before image builds finish; a failure can leave a release without one or both images. Do not announce it as ready until both succeed.

The changelog groups features, fixes, security, performance, dependencies, documentation and refactors by commit type; breaking changes get a separate warning. Sections without entries do not appear. Use `deps:` for dependency changes and `security:` for security changes; Dependabot is configured to use `deps:` for its configured ecosystems. A visible `deps:`, `security:` or other listed commit can propose a patch release even when no `feat:` or `fix:` is present; merging that release PR remains a maintainer decision. Historical `chore(deps):` commits and other unlisted types do not appear automatically; add relevant entries during review. Use clear, user-facing PR titles: generated entries come from merged commit messages, not an independent review. Before merging the release PR, add highlights, migration notes and relevant acknowledgements where useful; contributor credits are not generated automatically. The first release may include a long history, so curate it for readers.

The generated `CHANGELOG.md` is excluded from Prettier checks because Release Please uses its own Markdown formatting; this prevents a newly generated release PR from failing formatting checks. For a curated release, update both the changelog entry and the release PR body, preserving the Release Please title and body structure: the PR body supplies the published release notes. A later Release Please run may regenerate these changes, so review both again before merging.

Stable versions produce exact, minor and `latest` image tags. A pre-release such as `v0.2.0-beta.1` receives only its exact tag, never `latest` or the minor alias. The `latest` tag moves; use an explicit version when reproducibility matters.

To retry a failed image publication, run the **Release** workflow manually with the existing tag after correcting the cause. It checks that the tag matches the backend version, manifest and `version.txt`. A retry may republish image tags for the same commit; it does not recreate the GitHub release. Never reuse a version for different source contents.

Before 1.0, fixes normally advance the patch (`0.1.0` to `0.1.1`) and features or breaking changes advance the minor (`0.1.0` to `0.2.0`). Breaking changes still need explicit release notes and migration guidance. After 1.0 the normal SemVer major/minor/patch rules apply.

The manual-preparation and merged-PR triggers must be validated on GitHub after this change. Local tests do not establish that these external steps work. If the automatic run does not start after merging the release PR, manually run **Prepare release** on `main`; confirm the release and image workflow before announcing it.

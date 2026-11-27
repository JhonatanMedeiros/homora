---
name: homora-release
description: Prepare, review and verify a Homora release with Release Please. For maintainers, only when explicitly asked to release.
disable-model-invocation: true
---

# Homora release

Guide a maintainer through one release. [The release guide](../../../docs/maintainers/releases.md)
is the source of truth: read it first, and follow it if it disagrees with this skill. Reply in the
user's language; keep changelog entries, release notes and PR text in English.

Release Please creates versions, tags and the changelog. Never create or edit a tag, a version
number or a release by hand to replace that flow.

## Ask before each of these

Each one needs its own explicit confirmation, even if an earlier step was approved:

1. Running the **Prepare release** workflow.
2. Pushing curated notes to the release branch or editing the release PR.
3. Merging the release PR (this publishes the release).
4. Re-running the **Release** workflow or publishing a draft.

## 1. Preflight (read-only)

- `gh auth status`, then `gh repo view --json nameWithOwner,viewerPermission`. Without write
  access, stop: report the release state, and leave the rest to a maintainer.
- `git fetch origin --tags`. Find the last release with `gh release list` and report any draft
  left over from an earlier attempt.
- Check that CI passed on the head of `main`.

## 2. Review what will be released

- `git log <last-tag>..origin/main --pretty='%h %s'`.
- Compare the subjects with `changelog-sections` in `release-please-config.json`. List commits that
  will not appear (unlisted types such as `chore:` or `ci:`, and non-conventional subjects) and ask
  whether any needs a manual entry.
- Point out breaking changes (`!` or `BREAKING CHANGE:`) and anything operators must act on:
  `git diff --name-only <last-tag>..origin/main -- packages/db/migrations compose*.yml .env.example Dockerfile`.
- State the version you expect, using the pre-1.0 rules in the guide. If there is nothing
  releasable, say so and stop.

## 3. Prepare the release PR

- After confirmation: `gh workflow run "Prepare release" --ref main`, then follow the run with
  `gh run watch`.
- Open the PR from `release-please--branches--main`. Keep its generated title.

## 4. Review the release PR

- `version.txt`, `.release-please-manifest.json`, `apps/backend/package.json` and every file in
  `extra-files` show the same version.
- All checks pass (`gh pr checks <number>`).
- Draft highlights, migration and backup notes, and acknowledgements where useful. Base them only
  on merged changes. Show the text before applying it.
- Apply approved notes to **both** `CHANGELOG.md` and the PR body, preserving the body structure:
  the body becomes the published release notes.
- If `main` moved, run the workflow again, then re-check this section: a refresh may regenerate the
  curated notes.

## 5. Merge

Summarize version, notes, compatibility impact and check status, then ask. Check that the commit
message left by the chosen merge method keeps the Release Please title.

## 6. Verify publication

- Follow the **Prepare release** run started by the merge, including the image jobs and
  `publish-release`.
- `gh release view <tag>`: published, not a draft, with the expected notes.
- For `homora` and `homora-discovery-agent` under `ghcr.io/<owner>/` (lowercase):
  `docker buildx imagetools inspect <image>:<version>` lists amd64 and arm64.
- If Docker can pull the images, compare the `org.opencontainers.image.version` and `revision`
  labels with the release version and the tag commit.

## If something fails

The release stays a draft when an image job fails. Find the cause (`gh run view <id> --log-failed`),
fix it, then follow the retry steps in the guide. Never reuse a version for different source.

## Report

Version, links to the release and the runs, what was verified, and what was not (for example, an
installation test or an image pull).

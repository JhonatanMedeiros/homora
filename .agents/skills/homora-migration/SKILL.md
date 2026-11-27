---
name: homora-migration
description: Change the Homora SQLite schema safely, with a compatible Drizzle migration and data preservation tests. Use for any change to tables, columns, indexes, views or triggers in packages/db.
---

# Homora database migration

Users upgrade with their only copy of the data in place. Read
[Persistence and Concurrency](../../../docs/standards.md#persistence-and-concurrency), the schema
files in `packages/db/src/`, and the migrator in `packages/db/src/index.ts`.

## Rules

- Never edit, rename, reorder or delete a migration that is already on `main`. The migrator compares
  hashes and order, and refuses to start on a database whose history differs.
- Prefer additive changes. Dropping or renaming data, or tightening a constraint, needs the user's
  agreement and a plan for existing rows.
- Never run experiments against a real database or backup. Use `:memory:` or a temporary directory.

## Steps

1. Change the schema in `packages/db/src/`.
2. Run `pnpm db:generate`. For SQL that Drizzle does not derive from the schema (data backfills,
   triggers, some views), use `pnpm db:generate --custom` and write it.
3. Read the generated SQL. Check table rebuilds (every row, index, view and trigger survives),
   defaults for new `NOT NULL` columns, and foreign keys. Foreign keys are off while migrations
   run, and new violations roll the whole run back.
4. Commit the SQL together with `migrations/meta/`.
5. Rebase on `main` before opening the PR. If another migration landed first, remove your
   unmerged one and generate it again instead of renumbering by hand.

## Tests

Add a test in `packages/db/src/index.test.ts`, following the existing upgrade test:

- start from the **previous** schema with representative rows (not an empty database);
- reopen with `createDatabase` so the new migration applies;
- assert that existing values are preserved, new columns have the intended defaults, and
  `PRAGMA foreign_key_check` is empty;
- close handles and remove temporary files.

An older upgrade test may undo later migrations to rebuild its starting point. If yours is affected,
extend that rollback; do not weaken the assertions.

```sh
pnpm --filter @homora/db build
pnpm exec vitest run packages/db
pnpm check
pnpm build
```

## Report

Describe the change in existing data terms, whether an older build can still open the database (it
refuses a newer history), and any backup step operators should take. Put this in the PR.

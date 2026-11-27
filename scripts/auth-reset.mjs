import { DatabaseSync } from 'node:sqlite';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

// Removes the administrator account and every session so the next visit shows the first-run
// account creation again. Cards, groups and encrypted connections are kept.
// With --two-factor-only the account and password stay: only the authenticator app and the
// recovery codes are removed (and every session ends), for a lost phone or a lost session secret.
// With --passkeys-only the account and password stay too: only the passkeys are removed (and every
// session ends), for a lost authenticator or a changed domain (RP ID) that made them unusable.
// With --oidc-only the account and password stay too: only the linked OIDC identity and the
// provider saved in the interface are removed (and every session ends), for a provider that was
// replaced, lost or must stop opening the account.
const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const twoFactorOnly = args.includes('--two-factor-only');
const passkeysOnly = args.includes('--passkeys-only');
const oidcOnly = args.includes('--oidc-only');
if ([twoFactorOnly, passkeysOnly, oidcOnly].filter(Boolean).length > 1) {
  // The preview and the removal would otherwise describe different things.
  console.error('Use only one of --two-factor-only, --passkeys-only and --oidc-only.');
  process.exit(1);
}
const target = resolve(
  args.find((arg) => !arg.startsWith('--')) ??
    process.env.HOMORA_DATABASE_PATH ??
    'data/homora.sqlite',
);
let db;
try {
  await access(target, constants.R_OK | constants.W_OK);
  db = new DatabaseSync(target);
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name),
  );
  for (const table of ['user', 'account', 'session', 'verification'])
    if (!tables.has(table))
      throw new Error('This database has no account tables. Start Homora once to migrate it.');
  const accounts = db.prepare('SELECT COUNT(*) AS n FROM "user"').get().n;
  // Databases from before two-factor authentication have neither the table nor the column.
  const hasTwoFactor = tables.has('twoFactor');
  // Likewise for passkeys.
  const hasPasskeys = tables.has('passkey');
  const userColumns = db.prepare('PRAGMA table_info("user")').all();
  const hasTwoFactorFlag = userColumns.some((column) => column.name === 'twoFactorEnabled');
  if (confirmed) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (oidcOnly) {
        // The identity is a row of the library's account table; the password row stays.
        if (
          db
            .prepare('PRAGMA table_info(account)')
            .all()
            .some((c) => c.name === 'providerId')
        )
          db.exec("DELETE FROM account WHERE providerId LIKE 'oidc-%'");
        // A provider saved in the interface goes too, so that the variables apply again.
        if (tables.has('oidc_settings')) db.exec('DELETE FROM oidc_settings');
        db.exec('DELETE FROM session');
        // Unfinished sign-in attempts.
        db.exec("DELETE FROM verification WHERE value LIKE '%codeVerifier%'");
      } else if (passkeysOnly) {
        for (const table of hasPasskeys ? ['passkey', 'session'] : ['session'])
          db.exec(`DELETE FROM "${table}"`);
        // Unfinished registration and sign-in challenges.
        db.exec(
          `DELETE FROM verification WHERE value LIKE '%"type":"registration"%' OR value LIKE '%"type":"authentication"%'`,
        );
      } else if (twoFactorOnly) {
        for (const table of hasTwoFactor ? ['twoFactor', 'session'] : ['session'])
          db.exec(`DELETE FROM "${table}"`);
        // Unfinished sign-in challenges and trusted-device records live here.
        db.exec(
          "DELETE FROM verification WHERE identifier LIKE '2fa-%' OR identifier LIKE 'trust-device-%'",
        );
        if (hasTwoFactorFlag) db.exec('UPDATE "user" SET twoFactorEnabled = 0');
      } else {
        // Child rows first: no authenticator secret, recovery code or passkey outlives its account.
        for (const table of [
          ...(hasTwoFactor ? ['twoFactor'] : []),
          ...(hasPasskeys ? ['passkey'] : []),
          // A provider saved by the removed account must not outlive it.
          ...(tables.has('oidc_settings') ? ['oidc_settings'] : []),
          'session',
          'account',
          'verification',
          'user',
        ])
          db.exec(`DELETE FROM "${table}"`);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    if (oidcOnly) {
      console.log(
        `Removed the linked OIDC identity, the saved provider and every session from ${target}.`,
      );
      console.log('Sign in with the password, then link the identity again in Account if needed.');
    } else if (passkeysOnly) {
      console.log(`Removed every passkey and every session from ${target}.`);
      console.log(
        'Sign in with the password, then add a passkey again in Account if you want one.',
      );
    } else if (twoFactorOnly) {
      console.log(`Removed two-factor authentication and every session from ${target}.`);
      console.log('Sign in with the password, then turn it on again in Account if you want it.');
    } else {
      console.log(`Removed ${accounts} account(s) and every session from ${target}.`);
      console.log('Open Homora to create a new administrator account.');
    }
  } else {
    console.log(`${target} has ${accounts} account(s). Nothing was changed.`);
    console.log(
      twoFactorOnly
        ? 'Run again with --yes to remove two-factor authentication and end all sessions.'
        : passkeysOnly
          ? 'Run again with --yes to remove every passkey and end all sessions.'
          : oidcOnly
            ? 'Run again with --yes to remove the linked OIDC identity and the saved provider, and end all sessions.'
            : 'Run again with --yes to remove the account and all sessions.',
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not reset the account.');
  process.exitCode = 1;
} finally {
  db?.close();
}

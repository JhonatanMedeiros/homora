import { isIP } from 'node:net';

export type PasskeyConfig = {
  /** WebAuthn relying party ID: the registrable domain the credentials are bound to. */
  rpId: string;
  /** The only origins a ceremony may come from; decided here, never by request headers. */
  origins: string[];
};

const LOCALHOST = 'localhost';

/** Validates `HOMORA_PASSKEY_RP_ID`: a lowercase DNS name, never an address or a URL. */
export function parsePasskeyRpId(value: string | undefined): string | undefined {
  const rpId = value?.trim();
  if (!rpId) return undefined;
  if (
    rpId.length > 253 ||
    isIP(rpId) !== 0 ||
    !/^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(rpId)
  )
    throw new Error(
      'HOMORA_PASSKEY_RP_ID must be a lowercase domain name, without scheme or port.',
    );
  return rpId;
}

const hostMatches = (hostname: string, rpId: string) =>
  hostname === rpId || hostname.endsWith(`.${rpId}`);

/**
 * Passkeys are bound to the RP ID and to explicit origins. By default that is `localhost` and the
 * web port. `HOMORA_PASSKEY_RP_ID` moves them to a domain, in which case only the HTTPS origins
 * from `HOMORA_ALLOWED_ORIGINS` under that domain count. Changing the RP ID later makes the
 * existing passkeys unusable: they are tied to the domain they were created for.
 */
export function resolvePasskeyConfig({
  webPort,
  allowedOrigins,
  rpId = LOCALHOST,
}: {
  webPort: number;
  allowedOrigins: readonly string[];
  rpId?: string;
}): PasskeyConfig {
  const candidates =
    rpId === LOCALHOST ? [`http://${LOCALHOST}:${webPort}`, ...allowedOrigins] : allowedOrigins;
  const origins = [
    ...new Set(
      candidates.filter((origin) => {
        const { protocol, hostname } = new URL(origin);
        return rpId === LOCALHOST
          ? hostname === LOCALHOST
          : protocol === 'https:' && hostMatches(hostname, rpId);
      }),
    ),
  ];
  if (origins.length === 0)
    throw new Error(
      'HOMORA_PASSKEY_RP_ID needs an HTTPS origin under that domain in HOMORA_ALLOWED_ORIGINS.',
    );
  return { rpId, origins };
}

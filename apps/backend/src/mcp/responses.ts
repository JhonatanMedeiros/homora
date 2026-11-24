import { IntegrationRowsLimitError } from '@homora/integrations/backend/manifest';

/**
 * Transport-independent MCP response helpers. They hold no state and never see
 * credentials: every message returned to an agent is built here.
 */
export const unauthorized = () => ({
  content: [
    {
      type: 'text' as const,
      text: 'Agent identity is missing, revoked, or lacks the required scope.',
    },
  ],
  isError: true as const,
});

/** Only the pending-proposal limit is named: it is actionable for the agent and not sensitive. */
const STABLE_REASONS = new Set([
  'unknown-page',
  'unknown-connection',
  'unsupported-type',
  'invalid-widget',
  'invalid-position',
  'widget-limit',
  'widget-not-found',
]);
export const failed = (error?: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text:
        error instanceof IntegrationRowsLimitError
          ? 'integration-rows-limit: The integration returned too many rows.'
          : error instanceof Error && STABLE_REASONS.has(error.message)
            ? `${error.message}: The widget change was rejected.`
            : error instanceof Error && error.message === 'Pending proposal limit reached'
              ? 'Pending proposal limit reached (100). Wait for review or expiry, or withdraw one with withdraw_proposal.'
              : 'The request could not be completed.',
    },
  ],
  isError: true as const,
});

/** MCP clients may inspect their proposals, but maintenance notes and connection URLs stay in the human UI. */
export function redactMcpValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactMcpValue);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) {
    if (key === 'diff' && typeof item === 'string') {
      try {
        output[key] = JSON.stringify(redactMcpValue(JSON.parse(item) as unknown));
      } catch {
        // An unparseable diff is withheld (null) rather than sent unredacted.
        output[key] = null;
      }
    } else if (input.kind === 'managed' && key === 'change' && item && typeof item === 'object') {
      const managed = item as Record<string, unknown>;
      const details: Record<string, unknown> | unknown =
        managed.change && typeof managed.change === 'object'
          ? { ...(managed.change as Record<string, unknown>) }
          : managed.change;
      if (details && typeof details === 'object') {
        const fields = details as Record<string, unknown>;
        if (managed.kind === 'maintenance') delete fields.note;
        if (managed.kind === 'connection-setup') {
          delete fields.url;
          delete fields.tokenId;
        }
        if (managed.kind === 'probe' && fields.probe && typeof fields.probe === 'object') {
          fields.probe = { ...(fields.probe as Record<string, unknown>) };
          delete (fields.probe as Record<string, unknown>).checkMatch;
        }
      }
      output[key] = redactMcpValue({ ...managed, change: details });
    } else if (
      input.kind === 'managed' &&
      key === 'before' &&
      input.change &&
      typeof input.change === 'object' &&
      (input.change as Record<string, unknown>).kind === 'probe' &&
      item &&
      typeof item === 'object'
    ) {
      const before = { ...(item as Record<string, unknown>) };
      if (before.probe && typeof before.probe === 'object') {
        before.probe = { ...(before.probe as Record<string, unknown>) };
        delete (before.probe as Record<string, unknown>).checkMatch;
      }
      output[key] = redactMcpValue(before);
    } else if (
      key === 'service' &&
      (input.op === 'create' || input.op === 'update') &&
      item &&
      typeof item === 'object'
    ) {
      const service = { ...(item as Record<string, unknown>) };
      if (typeof service.url === 'string') service.url = publicUrl(service.url);
      if (typeof service.icon === 'string' && /^https?:\/\//i.test(service.icon))
        service.icon = publicUrl(service.icon);
      output[key] = redactMcpValue(service);
    } else output[key] = redactMcpValue(item);
  }
  return output;
}

export const result = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(redactMcpValue(value)) }],
});

// URLs may contain API keys in query strings or fragments. Those portions are
// never needed to identify a connection and must not leave through MCP.
export const publicUrl = (value: string) => {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    // An unparseable URL is withheld (empty) rather than sent as-is.
    return '';
  }
};

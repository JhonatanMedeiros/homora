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
export const failed = (error?: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text:
        error instanceof IntegrationRowsLimitError
          ? 'integration-rows-limit: The integration returned too many rows.'
          : error instanceof Error && error.message === 'Pending proposal limit reached'
            ? 'Pending proposal limit reached (100). Wait for review or expiry, or withdraw one with withdraw_proposal.'
            : 'The request could not be completed.',
    },
  ],
  isError: true as const,
});

export const result = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
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
    return '';
  }
};

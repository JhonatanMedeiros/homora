import { en as pageWidgets } from './messages/page-widgets.js';
import { en as core } from './messages/core.js';
import { en as appShell } from './messages/app-shell.js';
import { en as serviceCards } from './messages/service-cards.js';
import { en as serviceGroups } from './messages/service-groups.js';
import { en as serviceForm } from './messages/service-form.js';
import { en as serviceLinks } from './messages/service-links.js';
import { en as agents } from './messages/agents.js';
import { en as integrations } from './messages/integrations.js';
import { en as connections } from './messages/connections.js';
import { en as transfer } from './messages/transfer.js';
import { en as account } from './messages/account.js';
import { en as apiErrors } from './messages/api-errors.js';
import { en as status } from './messages/status.js';
import { en as settings } from './messages/settings.js';
import { en as hosts } from './messages/hosts.js';
import { en as appearance } from './messages/appearance.js';
import { en as resourceLink } from './messages/resources.js';
import { en as uptimeStatus } from './messages/uptime-status.js';
import { en as serviceDetail } from './messages/service-detail.js';
import { en as checks } from './messages/checks.js';
import { en as probes } from './messages/probes.js';

/** Source of truth for translation keys: every language must provide these exact keys. */
export const en = {
  ...core,
  ...appShell,
  ...serviceCards,
  ...serviceGroups,
  ...serviceForm,
  ...serviceLinks,
  ...agents,
  ...integrations,
  ...connections,
  ...transfer,
  ...account,
  ...apiErrors,
  ...status,
  ...settings,
  ...hosts,
  ...appearance,
  ...resourceLink,
  ...uptimeStatus,
  ...serviceDetail,
  ...checks,
  ...probes,
  ...pageWidgets,
} as const;
export type MessageKey = keyof typeof en;

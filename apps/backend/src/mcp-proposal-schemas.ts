import { serviceProposalSchema } from './input-schemas.js';
import { discoverySchema } from './mcp-discovery-schema.js';
import {
  cardOrderSchema,
  groupChangeSchema,
  widgetChangeSchema,
  maintenanceChangeSchema,
  pageChangeSchema,
  probeChangeSchema,
  acknowledgementChangeSchema,
  resourceLinkChangeSchema,
  pinChangeSchema,
} from './managed-proposals.js';

// The MCP SDK publishes an empty inputSchema for z.discriminatedUnion, so tools
// advertise these flat object schemas for discovery. The strict discriminated
// unions in proposals.ts / managed-proposals.ts remain the source of truth and
// re-validate every call.
export const serviceProposalDiscoverySchema = discoverySchema(
  'propose_service_card',
  serviceProposalSchema,
);
export const groupChangeDiscoverySchema = discoverySchema(
  'propose_group_change',
  groupChangeSchema,
);
export const cardOrderDiscoverySchema = discoverySchema('propose_card_order', cardOrderSchema);
export const pageChangeDiscoverySchema = discoverySchema('propose_page_change', pageChangeSchema);
export const probeChangeDiscoverySchema = discoverySchema('propose_probe', probeChangeSchema);
export const acknowledgementDiscoverySchema = discoverySchema(
  'propose_acknowledgement',
  acknowledgementChangeSchema,
);
export const resourceLinkDiscoverySchema = discoverySchema(
  'propose_resource_link',
  resourceLinkChangeSchema,
);
export const pinChangeDiscoverySchema = discoverySchema('propose_pin', pinChangeSchema);
export const maintenanceDiscoverySchema = discoverySchema(
  'propose_maintenance',
  maintenanceChangeSchema,
);
export const widgetChangeDiscoverySchema = discoverySchema(
  'propose_widget_change',
  widgetChangeSchema,
);

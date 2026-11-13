import { serviceProposalSchema } from './input-schemas.js';
import { discoverySchema } from './mcp-discovery-schema.js';
import { cardOrderSchema, groupChangeSchema, widgetChangeSchema } from './managed-proposals.js';

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
export const widgetChangeDiscoverySchema = discoverySchema(
  'propose_widget_change',
  widgetChangeSchema,
);

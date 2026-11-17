export { createDegradedSince } from './degraded-since.js';
/**
 * Public interface of the monitoring capability: check scheduling and probing, observation
 * history, hourly rollups, uptime, incidents and maintenance windows.
 *
 * Everything outside `monitoring/` imports from here. Internals (probe classification, network
 * checks, response-body matching, uptime SQL) stay private to the folder. The server composition
 * (`app.ts`), the SQLite schema/migrations and the destination policy (`network-policy.ts`,
 * `network-request.ts`) deliberately remain outside this folder as trusted boundaries.
 * See docs/architecture.md ("Monitoring capability").
 */
export { createServiceMonitor, startServiceMonitor } from './monitor.js';
export type { CheckResult, ServiceStatus, StatusReason } from './monitor.js';
export { createObservationStore } from './observations.js';
export { createRollupStore } from './rollup.js';
export { createIncidentStore } from './incidents.js';
export type { IncidentTransition } from './incidents.js';
export { createMeasurementGuard } from './measurement.js';
export type { MeasurementIncident, MeasurementTransition } from './measurement.js';
export { createMaintenanceStore, MaintenanceError } from './maintenance.js';
export { serviceSignature } from './signature.js';
export { createMonitoringTrustStore } from './trust.js';
export { createMonitoringSource, toMonitoringService } from './service-source.js';

export { resolveCheckTarget } from './target.js';
export { UPTIME_MIN_CHECKS, uptimeSummarizerOf } from './uptime.js';

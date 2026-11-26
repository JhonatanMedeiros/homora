import { createManifestRegistration, type ManifestHost } from '../../backend-manifest-adapter.js';
import { transportFrom, type IntegrationContext, type InputErrorFactory } from '../../backend.js';
import { healthchecksManifest } from './definition.js';

const priorities: Record<string, number> = { down: 0, grace: 1, new: 2, paused: 3, up: 4 };

export function createHealthchecksRegistration(inputError: InputErrorFactory) {
  const host: ManifestHost = {
    isBrandIcon: (name) => name === healthchecksManifest.brandIcon,
    isErrorCode: (code) => code === 'https-url-required' || code === 'invalid-token',
    inputError,
  };
  const base = createManifestRegistration(healthchecksManifest, host);
  return {
    ...base,
    prepareWidgetQuery(context: IntegrationContext) {
      if (!base.prepare) throw new Error('Healthchecks integration unavailable.');
      base.prepare(context);
      const transport = transportFrom(context);
      const url = new URL(String(context.publicConfig.url ?? ''));
      const origin = url.origin;
      const basePath = url.pathname.replace(/\/+$/, '');
      const apiKey = context.credentials.secret ?? '';
      return async (operation: string, params: unknown) => {
        if (
          operation !== 'job-checks' ||
          !params ||
          typeof params !== 'object' ||
          Array.isArray(params) ||
          Object.keys(params).length > 0
        )
          throw new Error('Invalid Healthchecks widget query.');
        const response = await transport({
          origin,
          path: `${basePath}/api/v3/checks/`,
          apiKey,
          maxBodyBytes: 1_000_000,
        });
        if (
          response.status < 200 ||
          response.status >= 300 ||
          !response.body ||
          typeof response.body !== 'object' ||
          Array.isArray(response.body)
        )
          throw inputError('invalid-data');
        const checks = (response.body as Record<string, unknown>).checks;
        if (!Array.isArray(checks) || checks.length > 10_000) throw inputError('invalid-data');
        const rows = checks.map((raw: unknown) => {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw inputError('invalid-data');
          const item = raw as Record<string, unknown>;
          if (
            typeof item.name !== 'string' ||
            item.name.length > 256 ||
            typeof item.status !== 'string' ||
            (item.last_ping !== null &&
              (typeof item.last_ping !== 'string' ||
                item.last_ping.length > 128 ||
                !Number.isFinite(Date.parse(item.last_ping))))
          )
            throw inputError('invalid-data');
          return {
            name: item.name,
            status: Object.hasOwn(priorities, item.status) ? item.status : 'unknown',
            lastPing: item.last_ping as string | null,
          };
        });
        rows.sort(
          (a, b) =>
            (priorities[a.status] ?? 2) - (priorities[b.status] ?? 2) ||
            a.name.localeCompare(b.name),
        );
        return {
          checks: rows.slice(0, 50),
          total: rows.length,
          fetchedAt: Date.now(),
          stale: false,
        };
      };
    },
  };
}

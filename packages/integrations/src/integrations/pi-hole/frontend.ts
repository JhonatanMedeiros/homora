import { definePresentation } from '../../frontend.js';
import { parseBlocking, parseSummary } from './contracts.js';

export function createPiHolePresentation(t: (key: string) => string) {
  return definePresentation({
    placeholderCount: 5,
    stats(value) {
      try {
        const data = parseSummary(
          value && typeof value === 'object'
            ? {
                queries: {
                  total: (value as Record<string, unknown>).queries,
                  blocked: (value as Record<string, unknown>).blocked,
                  percent_blocked: (value as Record<string, unknown>).percent,
                },
                gravity: { domains_being_blocked: (value as Record<string, unknown>).domains },
              }
            : null,
        );
        return [
          { label: t('pihole.queries'), value: String(data.queries) },
          { label: t('pihole.blocked'), value: String(data.blocked) },
          { label: t('pihole.percent'), value: `${data.percent.toFixed(1)}%` },
          { label: t('pihole.domains'), value: String(data.domains) },
          { label: t('pihole.protection'), value: t(`pihole.${parseBlocking(value)}`) },
        ];
      } catch {
        return null;
      }
    },
  });
}

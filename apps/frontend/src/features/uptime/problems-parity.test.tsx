// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { WidgetHostProvider } from '@homora/widgets/ui';
import { ProblemsContent } from '@homora/widgets/current-problems/ui';
import { ProbableCauses } from './probable-causes';
import { reasonText } from './uptime-view';
import { setLocale, tOr } from '@/i18n';

afterEach(() => {
  cleanup();
  setLocale('en');
});
it.each(['en', 'pt-BR'] as const)('uses the same monitor reason as the popover in %s', (locale) => {
  setLocale(locale);
  const now = Date.now();
  const services = [
    { id: 1, name: 'One' },
    { id: 2, name: 'Two' },
  ] as Service[];
  render(
    <>
      <ProbableCauses
        alwaysOpen
        down={services}
        incidents={
          {
            1: { startedAt: now - 10_000, reason: 'error-status', httpStatus: 503 },
            2: { startedAt: now - 20_000, reason: 'error-status', httpStatus: 503 },
          } as never
        }
        impacts={new Map()}
        onOpen={() => {}}
      />
      <WidgetHostProvider
        value={{
          locale,
          t: (key, params) => tOr(key, key, params),
          openMonitor: () => {},
          monitoring: {
            readSummary: async () => {
              throw Error();
            },
            readScopes: async () => ({ pages: [], groups: [] }),
          },
        }}
      >
        <ProblemsContent
          reading={{
            status: 'ready',
            now,
            stale: false,
            data: {
              generatedAt: now,
              total: 1,
              unmeasured: 0,
              truncated: false,
              items: [
                {
                  id: 1,
                  name: 'One',
                  state: 'down',
                  lastAttempt: now,
                  stale: false,
                  latencyMs: null,
                  since: now - 10_000,
                  reason: 'error-status',
                  httpStatus: 503,
                  isService: true,
                },
              ],
            },
          }}
        />
      </WidgetHostProvider>
    </>,
  );
  expect(screen.getAllByText(new RegExp(reasonText('error-status', 503))).length).toBe(2);
  expect(screen.getByText(locale === 'en' ? /Likely cause/ : /Causa provável/)).toBeTruthy();
});

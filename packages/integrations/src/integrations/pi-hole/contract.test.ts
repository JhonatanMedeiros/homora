import { runAdapterContract } from '../../../test-support/adapter-contract.js';
import { fixture, urlCases } from '../../../test-support/integration-test-support.js';
import { createPiHoleAdapter } from './backend.js';
const secret = 'test-app-password';
const validConfig = { url: 'https://pihole.example.test', secret };
runAdapterContract({
  name: 'pi-hole',
  create: (transport) => createPiHoleAdapter(transport, (code) => new Error(code)),
  validConfig,
  secrets: [secret],
  invalidConfigs: [
    ...urlCases(['http://pihole.example.test', 'https://pihole.example.test/prefix']).map(
      ({ label, url }) => ({ label, config: { url, secret } }),
    ),
    { label: 'empty password', config: { ...validConfig, secret: '' } },
    { label: 'oversized password', config: { ...validConfig, secret: 'a'.repeat(257) } },
    { label: 'control character in password', config: { ...validConfig, secret: 'x\ny' } },
    { label: 'null config', config: null },
  ],
  fixtures: {
    valid: {
      body: fixture('pi-hole/summary.json'),
      expected: {
        queries: 7497,
        blocked: 3465,
        percent: 34.5,
        domains: 104756,
        blocking: 'unknown',
      },
    },
    wrongShape: [
      { label: 'missing data', body: {} },
      {
        label: 'string total',
        body: {
          queries: { total: '5', blocked: 1, percent_blocked: 20 },
          gravity: { domains_being_blocked: 10 },
        },
      },
    ],
    oversized: [
      {
        label: 'invalid percentage',
        body: {
          queries: { total: 1, blocked: 1, percent_blocked: 101 },
          gravity: { domains_being_blocked: 1 },
        },
      },
      {
        label: 'unsafe total',
        body: {
          queries: { total: 1e30, blocked: 1, percent_blocked: 1 },
          gravity: { domains_being_blocked: 1 },
        },
      },
    ],
    echoSecret: (s) => ({
      queries: { total: s, blocked: 1, percent_blocked: 1 },
      gravity: { domains_being_blocked: 1 },
    }),
  },
});

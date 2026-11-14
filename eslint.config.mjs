import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import { readdirSync, readFileSync } from 'node:fs';

const integrationTypes = readdirSync(
  new URL('./packages/integrations/src/integrations/', import.meta.url),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    try {
      const type = JSON.parse(
        readFileSync(
          new URL(
            `./packages/integrations/src/integrations/${entry.name}/integration.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ).type;
      if (typeof type !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(type))
        throw new Error(`Invalid integration type in ${entry.name}`);
      return [type];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  });
const integrationImports = [
  {
    regex: `^@homora/integrations/(?:definitions/)?(?:${integrationTypes.join('|')})(?:/|$)`,
    message: 'Use the generic integration SDK entry points.',
  },
  {
    regex: '(^|/)packages/integrations/src/integrations/',
    message: 'Use the generic integration SDK entry points.',
  },
];

const backendCapabilityImports = [
  {
    regex: '/monitoring/(?!index(\\.js)?$)',
    message: 'Import the monitoring capability through monitoring/index.ts.',
  },
  {
    regex: '/transfer/(?!index(\\.js)?$)',
    message: 'Import configuration transfer through transfer/index.ts.',
  },
  {
    regex: '/discovery/(?!index(\\.js)?$)',
    message: 'Import Docker discovery through discovery/index.ts.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.agent/**',
      '.agents/**',
      '.claude/**',
      '.github/agents/**',
      '.github/skills/**',
      '.impeccable/**',
      '.turbo/**',
      '.idea/**',
      'packages/db/migrations/**',
      'coverage/**',
      // Agent skills installed by external tools.
      '.agent/**',
      '.agents/**',
      '.claude/**',
      '.codex/**',
      '.hermes/**',
      '.github/skills/**',
      '.impeccable/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{js,mjs,cjs,ts,tsx}'], languageOptions: { globals: { ...globals.node } } },
  {
    files: ['apps/frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Runtime integrations are host-independent; their contract tests still use backend helpers.
    files: ['packages/integrations/src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@homora/(backend|frontend|db|shared)(/|$)',
              message: 'Integration runtime must not depend on application packages.',
            },
            {
              regex: '(^|/)apps/(backend|frontend)(/|$)',
              message: 'Integration runtime must not depend on application source.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/frontend/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: { 'no-restricted-imports': ['error', { patterns: integrationImports }] },
  },
  {
    // Capabilities expose one entry point: outside code imports `monitoring/index.ts` or
    // `transfer/index.ts` or `discovery/index.ts`, never their internals.
    files: ['apps/backend/src/**/*.ts', 'apps/backend/bench/**/*.ts'],
    ignores: [
      'apps/backend/src/monitoring/**',
      'apps/backend/src/transfer/**',
      'apps/backend/src/discovery/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [...integrationImports, ...backendCapabilityImports],
        },
      ],
    },
  },
  {
    // Tests may use integration-specific helpers, but keep the capability entry-point rules.
    files: [
      'apps/backend/src/**/*.test.ts',
      'apps/backend/src/**/*.spec.ts',
      'apps/backend/bench/**/*.test.ts',
      'apps/backend/bench/**/*.spec.ts',
    ],
    ignores: [
      'apps/backend/src/monitoring/**',
      'apps/backend/src/transfer/**',
      'apps/backend/src/discovery/**',
    ],
    rules: { 'no-restricted-imports': ['error', { patterns: backendCapabilityImports }] },
  },
  {
    files: ['apps/backend/src/{monitoring,transfer,discovery}/**/*.ts'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: { 'no-restricted-imports': ['error', { patterns: integrationImports }] },
  },
  {
    files: ['apps/frontend/src/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Code generated by shadcn/ui and kept as-is: upstream uses these patterns.
    files: [
      'apps/frontend/src/components/ui/**/*.{ts,tsx}',
      'apps/frontend/src/hooks/use-mobile.ts',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  prettier,
);

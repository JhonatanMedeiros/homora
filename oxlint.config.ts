import { defineConfig } from 'oxlint';
import { readdirSync, readFileSync } from 'node:fs';

// Same integration-type discovery as the former eslint.config.mjs.
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
// The regex engine has no lookahead, so the "everything except index" rule uses a negated group.
const capability = (dir, message) => ({
  group: [`**/${dir}/**`, `!**/${dir}/index`, `!**/${dir}/index.js`],
  message,
  caseSensitive: true,
});
const backendCapabilityImports = [
  capability('monitoring', 'Import the monitoring capability through monitoring/index.ts.'),
  capability('transfer', 'Import configuration transfer through transfer/index.ts.'),
  capability('discovery', 'Import Docker discovery through discovery/index.ts.'),
];
const restrict = (patterns) => ({ 'eslint/no-restricted-imports': ['error', { patterns }] });
const src = '{ts,tsx,js,jsx,mjs,cjs}';

// Rules that fail today are kept as warnings so they stay visible without blocking CI.
// Remove an entry once the code is clean; the rule then fails the build.
const ratchet = {
  'eslint/require-await': 'warn',
  'eslint/require-unicode-regexp': 'warn',
  'eslint/max-lines-per-function': 'warn',
  'vitest/no-conditional-in-test': 'warn',
  'vitest/require-mock-type-parameters': 'warn',
  'eslint/no-await-in-loop': 'warn',
  'vitest/require-to-throw-message': 'warn',
  'unicorn/consistent-function-scoping': 'warn',
  'import/max-dependencies': 'warn',
  'eslint/max-lines': 'warn',
  'unicorn/no-array-sort': 'warn',
  'unicorn/explicit-length-check': 'warn',
  'promise/always-return': 'warn',
  'vitest/valid-expect': 'warn',
  'unicorn/prefer-string-replace-all': 'warn',
  'eslint/no-negated-condition': 'warn',
  'unicorn/no-negated-condition': 'warn',
  'unicorn/new-for-builtins': 'warn',
  'unicorn/no-useless-undefined': 'warn',
  'oxc/no-map-spread': 'warn',
  'unicorn/no-array-callback-reference': 'warn',
  'eslint/no-shadow': 'warn',
  'eslint/no-promise-executor-return': 'warn',
  'react/exhaustive-effect-dependencies': 'warn',
  'eslint/no-inline-comments': 'warn',
  'vitest/no-conditional-expect': 'warn',
  'unicorn/prefer-event-target': 'warn',
  'unicorn/prefer-query-selector': 'warn',
  'eslint/eqeqeq': 'warn',
  'react/no-array-index-key': 'warn',
  'react/no-object-type-as-default-prop': 'warn',
  'eslint/max-depth': 'warn',
  'unicorn/prefer-code-point': 'warn',
  'eslint/sort-vars': 'warn',
  'unicorn/escape-case': 'warn',
  'unicorn/prefer-type-error': 'warn',
  'vitest/expect-expect': 'warn',
  'unicorn/no-hex-escape': 'warn',
  'unicorn/no-object-as-default-parameter': 'warn',
  'eslint/no-underscore-dangle': 'warn',
  'eslint/no-unmodified-loop-condition': 'warn',
  'unicorn/prefer-set-has': 'warn',
  'unicorn/no-array-reverse': 'warn',
  'unicorn/prefer-at': 'warn',
  'oxc/no-async-endpoint-handlers': 'warn',
  'import/no-named-as-default-member': 'warn',
  'unicorn/prefer-string-starts-ends-with': 'warn',
  'unicorn/prefer-import-meta-properties': 'warn',
  'unicorn/prefer-dom-node-dataset': 'warn',
  'eslint/no-loop-func': 'warn',
  'eslint/no-inner-declarations': 'warn',
  'unicorn/no-immediate-mutation': 'warn',
  'eslint/no-new': 'warn',
  'unicorn/prefer-number-coercion': 'warn',
  'vitest/no-conditional-tests': 'warn',
  'unicorn/prefer-dom-node-append': 'warn',
  'unicorn/no-lonely-if': 'warn',
  'import/no-named-as-default': 'warn',
  'unicorn/prefer-array-find': 'warn',
  'import/no-unassigned-import': 'warn',
  'react/jsx-no-useless-fragment': 'warn',
  'react/set-state-in-effect': 'warn',
  'react/jsx-no-constructed-context-values': 'warn',
  'eslint/no-lonely-if': 'warn',
  'eslint/no-useless-return': 'warn',
  'unicorn/no-unnecessary-array-splice-count': 'warn',
  'react/capitalized-calls': 'warn',
  'unicorn/no-unreadable-iife': 'warn',
  'eslint/max-classes-per-file': 'warn',
  'oxc/no-accumulating-spread': 'warn',
  'unicorn/prefer-array-some': 'warn',
  'react/purity': 'warn',
  'eslint/prefer-promise-reject-errors': 'warn',
  'eslint/no-else-return': 'warn',
  'unicorn/no-array-fill-with-reference-type': 'warn',
  'unicorn/no-useless-fallback-in-spread': 'warn',
  'unicorn/prefer-top-level-await': 'warn',
};

export default defineConfig({
  plugins: ['typescript', 'react', 'import', 'unicorn', 'oxc', 'promise', 'node', 'vitest'],
  categories: { correctness: 'error', suspicious: 'error', perf: 'error', pedantic: 'error' },
  ignorePatterns: [
    '**/dist/**',
    'docs/.vitepress/cache/**',
    '.agent/**',
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.hermes/**',
    '.github/agents/**',
    '.github/skills/**',
    '.impeccable/**',
    '.turbo/**',
    '.idea/**',
    'packages/db/migrations/**',
    'packages/db/src/migrations.generated.ts',
    'coverage/**',
    'data/**',
  ],
  env: { node: true, es2022: true },
  rules: {
    ...ratchet,
    // The JSX runtime is automatic, so React does not need to be in scope.
    'react/react-in-jsx-scope': 'off',
    // Rules the previous ESLint setup (recommended + typescript-eslint recommended) enforced.
    'typescript/no-explicit-any': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/no-empty-object-type': 'error',
    'eslint/no-empty': 'error',
    'eslint/no-regex-spaces': 'error',
    'eslint/no-useless-assignment': 'error',
    'eslint/no-var': 'error',
    'eslint/prefer-const': 'error',
    'eslint/prefer-rest-params': 'error',
    'eslint/prefer-spread': 'error',
    'react/only-export-components': ['warn', { allowConstantExport: true }],
  },
  overrides: [
    {
      files: [`packages/integrations/{src,test-support}/**/*.${src}`],
      rules: restrict([
        {
          regex: '^@homora/(backend|frontend|db|shared)(/|$)',
          message: 'Integration runtime must not depend on application packages.',
        },
        {
          regex: '(^|/)apps/(backend|frontend)(/|$)',
          message: 'Integration runtime must not depend on application source.',
        },
      ]),
    },
    {
      files: [`packages/ui/src/**/*.${src}`],
      rules: restrict([
        {
          regex: '^@homora/(backend|frontend|db|shared|integrations|widgets)(/|$)',
          message: 'UI must not depend on application or domain packages.',
        },
        {
          regex: '(^|/)(apps/(backend|frontend)|packages/(db|shared|integrations|widgets))(/|$)',
          message: 'UI must not depend on application or domain source.',
        },
        { regex: '^@/', message: 'UI must not import app aliases.' },
      ]),
    },
    {
      files: [`packages/widgets/{src,test-support}/**/*.${src}`],
      rules: restrict([
        {
          regex: '^@homora/(backend|frontend|db|shared|integrations)(/|$)',
          message: 'Widgets must not depend on applications or integrations.',
        },
        {
          regex: '(^|/)apps/(backend|frontend)(/|$)',
          message: 'Widgets must not depend on application source.',
        },
        {
          regex: '^\\.{1,2}/(?:.*/)?integrations(/|$)',
          message: 'Widgets must not depend on integration source.',
        },
      ]),
    },
    {
      files: [`packages/widgets/src/widgets/**/*.${src}`],
      excludeFiles: ['packages/widgets/src/widgets/**/ui/**'],
      rules: restrict([
        {
          regex: '^react(?:/|$)|^react-dom(?:/|$)|^@homora/ui(?:/|$)',
          message: 'Compiled widget modules cannot import UI.',
        },
        {
          regex:
            '^@homora/(backend|frontend|db|shared|integrations)(/|$)|(^|/)apps/|(^|/)integrations/',
          message: 'Widgets cannot depend on applications or integrations.',
        },
      ]),
    },
    {
      files: ['apps/frontend/src/**/*.{ts,tsx}'],
      excludeFiles: ['**/*.test.*', '**/*.spec.*'],
      rules: restrict(integrationImports),
    },
    {
      files: ['apps/backend/src/**/*.ts', 'apps/backend/bench/**/*.ts'],
      excludeFiles: [
        'apps/backend/src/monitoring/**',
        'apps/backend/src/transfer/**',
        'apps/backend/src/discovery/**',
      ],
      rules: restrict([...integrationImports, ...backendCapabilityImports]),
    },
    {
      files: [
        'apps/backend/src/**/*.test.ts',
        'apps/backend/src/**/*.spec.ts',
        'apps/backend/bench/**/*.test.ts',
        'apps/backend/bench/**/*.spec.ts',
      ],
      excludeFiles: [
        'apps/backend/src/monitoring/**',
        'apps/backend/src/transfer/**',
        'apps/backend/src/discovery/**',
      ],
      rules: restrict(backendCapabilityImports),
    },
    {
      files: ['apps/backend/src/{monitoring,transfer,discovery}/**/*.ts'],
      excludeFiles: ['**/*.test.*', '**/*.spec.*'],
      rules: restrict(integrationImports),
    },
    { files: ['apps/frontend/src/main.tsx'], rules: { 'react/only-export-components': 'off' } },
    {
      // Code generated by shadcn/ui and kept as-is: upstream uses these patterns.
      files: [
        'packages/ui/src/components/**/*.{ts,tsx}',
        'apps/frontend/src/components/sidebar.tsx',
        'apps/frontend/src/hooks/use-mobile.ts',
      ],
      rules: {
        'react/only-export-components': 'off',
        'react/purity': 'off',
        'react/set-state-in-effect': 'off',
      },
    },
  ],
});

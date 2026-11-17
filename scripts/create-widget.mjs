import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Create a registered internal widget without overwriting an existing module. */
export async function createWidget(root, id) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || id.length < 2 || id.length > 40)
    throw new Error('Use a 2–40 character lowercase id with letters, numbers and hyphens.');
  const symbol = `widget${id.replaceAll(/(^|-)([a-z0-9])/g, (_, _separator, letter) => letter.toUpperCase())}`;
  const modulePath = `packages/widgets/src/widgets/${id}`;
  const paths = [
    'packages/widgets/src/registry.ts',
    'packages/widgets/src/translations.ts',
    'apps/frontend/src/components/widget-ui-registry.tsx',
    'packages/widgets/package.json',
  ];
  const [registry, translations, ui, manifestText] = await Promise.all(
    paths.map((path) => readFile(join(root, path), 'utf8')),
  );
  const manifest = JSON.parse(manifestText);
  if (
    manifest.exports[`./${id}/ui`] ||
    new RegExp(`\\b${symbol}Widget\\b`).test(registry) ||
    new RegExp(`\\b${symbol}\\b`).test(ui)
  )
    throw new Error('Widget or registration already exists.');
  function replaceOnce(text, pattern, replacement) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1)
      throw new Error('Widget registration structure changed; no files written.');
    return text.replace(pattern, replacement);
  }
  const nextRegistry = replaceOnce(
    registry,
    /const widgets = \{([\s\S]*?)\} as const;/g,
    (_match, entries) =>
      `const widgets = { ${entries.trim().replace(/,$/, '')}, '${id}': ${symbol}Widget } as const;`,
  );
  const nextTranslations = replaceOnce(
    translations,
    /export const widgetEnglish = \{([\s\S]*?)\} as const;/g,
    (_match, entries) =>
      `export const widgetEnglish = { ${entries.trim().replace(/,$/, '')}, ...${symbol} } as const;`,
  );
  const nextPortuguese = replaceOnce(
    nextTranslations,
    /export const widgetPortuguese: Record<keyof typeof widgetEnglish, string> = \{([\s\S]*?)\n\};/g,
    `export const widgetPortuguese: Record<keyof typeof widgetEnglish, string> = {$1\n  ...${symbol}Pt,\n};`,
  );
  const nextUI = replaceOnce(
    ui,
    /const widgets = \{([\s\S]*?)\} satisfies Record<\s*LocalWidgetType,\s*WidgetUI\s*>;/g,
    (_match, entries) =>
      `const widgets = { ${entries.trim().replace(/,$/, '')}, '${id}': ${symbol} } satisfies Record<LocalWidgetType, WidgetUI>;`,
  );
  manifest.exports[`./${id}/ui`] = `./src/widgets/${id}/ui/index.tsx`;
  const files = {
    'definition.ts': `import { defineWidget } from '../../index.js';\n\nexport const ${symbol}Widget = defineWidget({\n  type: '${id}',\n  version: 1,\n  locations: ['page'],\n  source: null,\n  portable: true,\n  defaultConfig: {},\n  parseConfig(value) {\n    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) return null;\n    return {};\n  },\n});\n`,
    'messages.ts': `export const en = {\n  'pageWidgets.${symbol}': '${id}',\n  'pageWidgets.${symbol}Desc': 'Example widget',\n} as const;\nexport const ptBR: Record<keyof typeof en, string> = {\n  'pageWidgets.${symbol}': '${id}',\n  'pageWidgets.${symbol}Desc': 'Widget de exemplo',\n};\n`,
    'definition.test.ts': `import { describe, expect, it } from 'vitest';\nimport { ${symbol}Widget } from './definition.js';\n\ndescribe('${id} widget', () => {\n  it('accepts the default configuration and rejects invalid input', () => {\n    expect(${symbol}Widget.parseConfig(${symbol}Widget.defaultConfig)).toEqual({});\n    expect(${symbol}Widget.parseConfig(null)).toBeNull();\n    expect(${symbol}Widget.parseConfig({ extra: true })).toBeNull();\n  });\n});\n`,
    'ui/index.tsx': `import { ${symbol}Widget } from '../definition.js';\nimport { useWidgetHost } from '../../../ui/host.js';\nimport type { WidgetUI } from '../../../ui/types.js';\n\nexport const widgetUI: WidgetUI = {\n  name: 'pageWidgets.${symbol}',\n  description: 'pageWidgets.${symbol}Desc',\n  defaultConfig: ${symbol}Widget.defaultConfig,\n  parse: ${symbol}Widget.parseConfig,\n  View: () => {\n    const { t } = useWidgetHost();\n    return <p>{t('pageWidgets.${symbol}')}</p>;\n  },\n  Editor: () => null,\n  Gallery: () => <span aria-hidden="true">◇</span>,\n};\n`,
    'README.md': `# ${id}\n\nReplace the example definition, UI and messages with the widget's behavior. Add tests for configuration, presentation and accessibility. Keep new sources, permissions and sizes in separate approved scope. Run pnpm check and pnpm build. See docs/create-widget.md.\n`,
  };
  const target = join(root, modulePath);
  await mkdir(target); // fail rather than overwrite
  await mkdir(join(target, 'ui'));
  for (const [path, content] of Object.entries(files))
    await writeFile(join(target, path), content, { flag: 'wx' });
  await writeFile(
    join(root, paths[0]),
    `import { ${symbol}Widget } from './widgets/${id}/definition.js';\n${nextRegistry}`,
  );
  await writeFile(
    join(root, paths[1]),
    `import { en as ${symbol}, ptBR as ${symbol}Pt } from './widgets/${id}/messages.js';\n${nextPortuguese}`,
  );
  await writeFile(
    join(root, paths[2]),
    `import { widgetUI as ${symbol} } from '@homora/widgets/${id}/ui';\n${nextUI}`,
  );
  await writeFile(join(root, paths[3]), `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: pnpm widget:create <type>');
    const target = await createWidget(resolve(import.meta.dirname, '..'), process.argv[2]);
    execFileSync(
      resolve(import.meta.dirname, '../node_modules/.bin/oxfmt'),
      [
        target,
        'packages/widgets/src/registry.ts',
        'packages/widgets/src/translations.ts',
        'apps/frontend/src/components/widget-ui-registry.tsx',
        'packages/widgets/package.json',
      ],
      { cwd: resolve(import.meta.dirname, '..'), stdio: 'inherit' },
    );
    console.log(`Created and registered ${target}. Follow its README and docs/create-widget.md.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not create widget.');
    process.exitCode = 1;
  }
}

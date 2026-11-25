import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { BRAND_ICON_NAMES } from '@homora/icons';
// `require.resolve` instead of `import.meta.resolve`: Vite rewrites the latter into a module that
// only Node's loader resolves, so it breaks when Vite runs on Bun.
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, 'HOMORA_'), ...process.env };
  const parsePort = (value: string | undefined, fallback: number) => {
    const port = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Invalid port in configuration.');
    return port;
  };
  const port = parsePort(env.HOMORA_WEB_PORT, 5173),
    apiPort = parsePort(env.HOMORA_API_PORT, 3000);
  if (port === apiPort) throw new Error('API and web interface ports must be different.');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'homora-brand-icons',
        apply: 'build',
        buildStart() {
          for (const name of BRAND_ICON_NAMES) {
            const source = readFileSync(require.resolve(`@homora/icons/assets/${name}.svg`));
            this.emitFile({ type: 'asset', fileName: `brand-icons/${name}.svg`, source });
          }
        },
      },
      {
        name: 'homora-brand-icons-dev',
        apply: 'serve',
        configureServer(server) {
          const names = new Set<string>(BRAND_ICON_NAMES);
          server.middlewares.use((req, res, next) => {
            const match = /^\/brand-icons\/([a-z0-9-]+)\.svg(?:\?.*)?$/.exec(req.url ?? '');
            if (!match || !names.has(match[1]!)) return next();
            const source = readFileSync(require.resolve(`@homora/icons/assets/${match[1]}.svg`));
            res.setHeader('Content-Type', 'image/svg+xml');
            res.end(source);
          });
        },
      },
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
        '/mcp': `http://127.0.0.1:${apiPort}`,
        '/docker-push': `http://127.0.0.1:${apiPort}`,
      },
    },
  };
});

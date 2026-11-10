import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, 'HOMORA_'), ...process.env };
  const parsePort = (value: string | undefined, fallback: number) => {
    const port = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Porta inválida na configuração.');
    return port;
  };
  const port = parsePort(env.HOMORA_WEB_PORT, 5173),
    apiPort = parsePort(env.HOMORA_API_PORT, 3000);
  if (port === apiPort) throw new Error('As portas da API e da interface devem ser diferentes.');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
  };
});

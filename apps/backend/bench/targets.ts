import http from 'node:http';
import { networkInterfaces } from 'node:os';

/* ---------------------------------------------------------------- mock monitored targets */

/** A private (RFC 1918) address of this host: Homora refuses loopback targets by policy. */
export function privateAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces()))
    for (const a of addresses ?? [])
      if (
        a.family === 'IPv4' &&
        !a.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)
      )
        return a.address;
  return null;
}

export async function startMockTarget(host: string, latencyMs: number, failRate = 0) {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    const reply = () => {
      res.statusCode = Math.random() < failRate ? 503 : 200;
      res.end('ok');
    };
    if (latencyMs > 0) setTimeout(reply, latencyMs);
    else reply();
  });
  server.keepAliveTimeout = 1000;
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const port = (server.address() as { port: number }).port;
  return {
    host,
    port,
    hits: () => hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

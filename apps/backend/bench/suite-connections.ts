import net from 'node:net';
import { readProc, round, runLoad, sleep, startProbe, table } from './lib.js';
import { ENDPOINTS, add, profile, results, type Fixture } from './runtime.js';

/* ---------------------------------------------------------------- suite: connections */

const openIdleSockets = async (port: number, count: number) => {
  const sockets: net.Socket[] = [];
  let failed = 0;
  const batch = 500;
  for (let i = 0; i < count; i += batch) {
    await Promise.all(
      Array.from(
        { length: Math.min(batch, count - i) },
        () =>
          new Promise<void>((resolve) => {
            const socket = net.connect(port, '127.0.0.1');
            socket.once('connect', () => {
              // Incomplete request headers keep the connection occupied (slowloris shape).
              socket.write('GET /api/auth/status HTTP/1.1\r\nHost: localhost\r\nX-Slow: ');
              sockets.push(socket);
              resolve();
            });
            socket.once('error', () => {
              failed++;
              resolve();
            });
          }),
      ),
    );
  }
  return { sockets, failed };
};

export async function suiteConnections(fixture: Fixture) {
  const { server, session } = fixture;
  const rows: Record<string, unknown>[] = [];
  const notes: string[] = [];
  for (const count of profile!.idleConnections) {
    await sleep(1000);
    const before = readProc(server.pid);
    const { sockets, failed } = await openIdleSockets(server.apiPort, count);
    await sleep(1500);
    const during = readProc(server.pid);
    const probe = startProbe(session, 20);
    const load = await runLoad({
      session,
      pid: server.pid,
      concurrency: 32,
      durationMs: 4000,
      pick: () => ENDPOINTS.defaults!(0, fixture),
    });
    const probed = await probe.stop();
    for (const s of sockets) s.destroy();
    await sleep(2000);
    const after = readProc(server.pid);
    rows.push({
      'conexões penduradas': count,
      'recusadas/falhas': failed,
      'RSS antes MB': before?.rssMb,
      'RSS com conexões MB': during?.rssMb,
      'KB por conexão':
        before && during
          ? round(((during.rssMb - before.rssMb) * 1024) / Math.max(1, sockets.length), 1)
          : '-',
      'FDs no servidor': during?.fds,
      'rps sob carga leve': load.rps,
      'p99 ms': load.p99Ms,
      '2xx%': load.requests ? round((load.ok / load.requests) * 100, 1) : 0,
      'RSS após fechar MB': after?.rssMb,
      'FDs após fechar': after?.fds,
    });
    void probed;
  }
  add({
    suite: 'connections',
    title: 'Conexões ociosas / lentas (estilo slowloris) — memória por conexão e degradação',
    data: table(rows),
    notes: notes.concat([
      'FDs após fechar devem voltar ao nível inicial; se não voltarem há vazamento de sockets.',
    ]),
  });
  results.at(-1)!.data = rows;
}

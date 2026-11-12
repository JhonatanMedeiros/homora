# Homora stress benchmark

Starts the real backend (`dist/`, falling back to `tsx`) as a child process on random loopback
ports with a temporary database, seeds it directly in SQL, and drives it with a built-in
closed-loop load generator. It never touches real infrastructure; monitored targets are local mock
servers on a private address of this machine (Homora refuses loopback targets by policy).

```sh
bun run build
bun run --filter @homora/backend bench --profile quick            # about 2 min, smoke
bun run --filter @homora/backend bench --profile heavy            # 20-40 min, 5k services, 1M history rows
bun run --filter @homora/backend bench --profile extreme          # over 1 h, 20k+ services, up to 60k connections
bun run --filter @homora/backend bench --profile heavy --suite http,write --dir /some/disk
```

Suites: `db`, `monitor`, `http`, `write`, `blocking`, `monitor-real`, `connections`, `abuse`, `soak`.
Results print as tables and are written as JSON (`--out`).

## Memory guard

Large responses and thousands of connections can exhaust a small machine (a WSL instance froze
during development). The run aborts itself, killing the server, when free memory drops below
`--min-free-mb` (default 3000) or the server's RSS passes `--max-server-rss-mb` (default 3500). An
abort is reported as a finding, not a benchmark error. The server also runs with a 3 GB V8 heap
cap. Raise the limits deliberately; do not run `extreme` on a machine you cannot afford to lose.

## Reading the numbers

- `srvCPU` is in percent of one core; `genCPU` near 100 means the generator was the bottleneck.
- `blocking` pings a cheap endpoint every 10 ms while a heavy operation runs; "maior parada" is how
  long the single JS thread stopped answering. That is the number that justifies moving work to a
  worker thread.
- Endpoints that return the whole inventory are capped at 256 concurrent connections in the ramp.

## Findings that led to code changes (heavy profile, 5,000 services, 1M history rows)

| Measure                                              | Before                               | After                               |
| ---------------------------------------------------- | ------------------------------------ | ----------------------------------- |
| `GET /api/services/uptime?range=24h`, 64 connections | 2 req/s, p50 28 s, server RSS 2.4 GB | 61 req/s, p50 1 s, RSS under 900 MB |
| `GET /api/services/uptime?range=30d`, 64 connections | 2 req/s, timeouts                    | 34 req/s                            |
| Event-loop stall during all-services uptime 30d      | 1,337 ms                             | 136 ms                              |
| `POST /api/services`                                 | about 600 ms                         | about 60 ms                         |
| `observations.publish` with nothing changed          | 348 ms                               | 7 ms                                |
| Import preview of 1 MB of nested garbage             | 600 ms stall                         | 15 ms                               |

Known limits, not changed: the monitor probes at most 5 services at once, which sustains roughly
3,000 services at 100 ms per check on the default 60 s interval; `GET /api/services` returns the
whole inventory (about 1.5 MB at 5,000 services) with no pagination, so many concurrent callers
multiply memory.

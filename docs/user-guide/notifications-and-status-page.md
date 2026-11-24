---
description: 'Send alerts to Telegram, ntfy, Discord or webhooks, and publish an optional read-only status page.'
---

# Notifications and the public status page

Push alerts to the channels you already use, and an optional read-only status page for visitors.

## Notifications

![Alert channels in Settings](../screenshots/settings-alerts.png)

In **Settings → Alerts**, add a Telegram, ntfy or Discord channel, or an HTTPS webhook, and use **Send test** to verify
delivery. A test sends a real message. Each channel shows its last successful send, last error and consecutive failed
attempts.

- Each channel has its own message language (new ones start with the interface language). Webhook JSON is
  language-independent.
- The webhook URL, bot token and chat ID are encrypted with the vault key and cannot be viewed again. Keep the database
  and its `.key` backup together.
- Private-network webhook destinations need explicit opt-in; loopback, link-local and other forbidden ranges stay
  blocked. TLS is validated and redirects are not followed.

### Telegram

1. Create a bot with BotFather and copy its token.
2. Start a conversation with the bot (or add it to a group) and send it a message.
3. Call `https://api.telegram.org/bot<TOKEN>/getUpdates` and note the message's `chat.id`.
4. Enter the token and the numeric chat ID in Homora.

Protect the token and keep that URL out of shell history and logs.

### Webhook payload

A webhook receives a JSON `POST` with:

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| `event`            | `down` or `up`                                                             |
| `service`          | `id`, `name`, `category` (the URL only if you explicitly enable it)        |
| `status`           | The service status                                                         |
| `reason`           | Why the check failed, if it did                                            |
| `httpStatus`       | The HTTP status code, if any                                               |
| `latencyMs`        | The check latency                                                          |
| `at`               | When it happened                                                           |
| `outageDurationMs` | Time from the first observed failure to confirmed recovery, when available |

Human-readable alerts include the reason, HTTP status and response time when available, and recovery messages the outage duration when known.

### When messages are sent

- An initial failed check emits `down`, and recovery after a notified outage emits `up`.
- An unknown result alone emits nothing and does not erase the last known state.
- Repeated outages within five minutes are suppressed, and so are their recoveries.
- Changing a service's monitoring configuration starts a new baseline.
- Each delivery gets up to three attempts with a five-second timeout; a retry can duplicate a message if the response was
  lost.
- Transition state survives restarts, but the in-memory delivery queue does not, so queued messages may be lost on
  shutdown.

### In-app notifications

The bell shows unread service and probe outage and recovery notifications, even without an external channel. Reading does
not acknowledge or mute an incident. The inbox keeps up to 90 days and 10,000 events (older ones are removed, unread
included).

## Public status page (optional, read-only)

![The public status page](../screenshots/public-status.png)

Homora can publish a minimal, read-only page at `/status`, so others can see what is up without signing in. It is
**closed by default**: nothing is public until an administrator enables it in **Settings** and marks each service with
**Show on the public status page** in its form.

### What visitors see

Only the service name, group, online/offline/unknown state, last check time, 24 hourly bars and the 24-hour uptime
percentage. Never URLs, descriptions, addresses, latency, HTTP codes, failure reasons or internal IDs.

### How it works

- The page calls only `GET /api/public/status`, the one anonymous API path, limited to 60 requests per minute per client
  and cached for 15 seconds.
- With the page disabled or no public service, it answers `404 not-found`.
- Imports and agent proposals never make a service public.

### Settings

Settings shows the page address, an optional description (up to 160 characters, visible to anyone with the link) and a
preview of exactly what visitors will see. Changes are recorded in the activity feed.

### Behind a proxy or gateway

- The per-client limit needs the real client address. Keep `HOMORA_TRUST_PROXY=true` behind a proxy that overwrites
  `X-Forwarded-For` (see [Deployment](deployment.md#deployment-scenarios)), or every visitor shares one limit.
- Behind Cloudflare Access or a similar gateway, `/status` and `/api/public/status` need a separate hostname or a bypass
  policy, or visitors are still asked to sign in.
- Exposing the page to the internet is your decision: review what is marked public first.

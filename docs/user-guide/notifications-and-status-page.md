# Notifications and the public status page

Two ways to tell people (including yourself) that something is down: push alerts to the channels you
already use, and an optional read-only status page for visitors.

## Notifications

![Alert channels in Settings](../screenshots/settings-alerts.png)

Telegram, ntfy and Discord messages use the language selected for each channel. New channels initially use the interface language; existing channels retain English after upgrade. Webhook JSON fields and values are unchanged.

In **Settings → Alerts**, add an HTTPS webhook or a Telegram channel and use **Send test** to verify delivery. For Telegram, create a bot with BotFather, start a conversation with it (or add it to a group), obtain the bot token and numeric chat ID, then enter both in Homora. After sending the bot a message, call `https://api.telegram.org/bot<TOKEN>/getUpdates` and use the message’s `chat.id`; protect the token and avoid saving the URL in shell history or logs. The webhook URL, bot token and chat ID are encrypted with the integration vault key; saved values cannot be viewed again. Keep the database and its `.key` backup together. Webhook destinations on private networks require explicit opt-in; loopback, link-local and other forbidden ranges remain blocked. TLS certificates are validated and redirects are not followed.

A webhook receives a JSON POST with `event` (`down` or `up`), `service` (`id`, `name`, `category`), `status`, `reason`, `httpStatus`, `latencyMs` and `at`. The service URL is included only when explicitly enabled. An initial failed check emits `down`; an unknown result alone emits nothing and does not erase the last known state. Recovery after a notified outage emits `up`. Repeated outages within five minutes are suppressed, and their recoveries are also suppressed. Changing a service's monitoring configuration starts a new baseline. Transition state survives restarts, but the bounded in-memory delivery queue does not: queued messages may be lost during shutdown. Each delivery gets up to three attempts and a five-second timeout. Retries can result in duplicate messages when the destination receives a request but its response is lost. A test sends a real message; the channel displays its last successful send, last error and consecutive failed attempts.

## Public status page (optional, read-only)

![The public status page](../screenshots/public-status.png)

Homora can publish a minimal, read-only page at `/status` so others can see what is up without signing in. It is **closed by default**: nothing is public until an administrator enables it in **Settings** and marks each service with "Show on the public status page" in its form.

- The page calls only `GET /api/public/status`, the one anonymous API path (exact match, never a prefix). It is limited to 60 requests per minute per client address and is cached for 15 seconds.
- Anonymous visitors receive only: service name, group, online/offline/unknown state, last check time, 24 hourly bars and the 24-hour uptime percentage. Never URLs, descriptions, addresses, latency, HTTP codes, failure reasons or internal ids.
- With the page disabled or no public service, the endpoint answers `404 not-found`, the same as a route that does not exist.
- Settings shows the page address (with copy and open buttons), an optional short description under the title (up to 160 characters, visible to anyone with the link) and a preview of exactly what visitors will see. Enabling or disabling the page, changing its title or description and marking a service are recorded in the activity feed. Importing a configuration and agent proposals never make a service public; the MCP only reports `publicStatusEnabled`.
- The per-client limit needs the real client address: keep `HOMORA_TRUST_PROXY=true` behind a proxy that overwrites `X-Forwarded-For` (see above), or every visitor shares one limit.
- If Homora sits behind Cloudflare Access (or a similar gateway), `/status` and `/api/public/status` must use a separate hostname or a bypass policy, otherwise visitors are still asked to sign in. Exposing it to the internet is your decision: review what is marked public first.

### In-app notifications

The bell shows unread service and probe outage and recovery notifications, even without an external channel.
Open it to review events and mark one or all as read. Reading does not acknowledge or mute an
incident. The inbox keeps up to 90 days and 10,000 events, including unread events; older entries
are removed. It starts empty after upgrading. The Activity
page remains available for auditing.

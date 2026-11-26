---
description: 'Service form, seven check types, thresholds, incidents, uptime, maintenance windows and host dependencies.'
---

# Services and monitoring

## Review monitoring coverage

On **Activity**, select **Review monitoring coverage** to assess the current configuration and
latest usable observations. The assessment lists missing check targets, destination-policy blocks,
maintenance pauses, stale observations (more than twice the check interval), and observations that
are unavailable. Follow the configuration link to review the affected service or probe. A missing
observation does not mean monitoring was disabled, and a maintenance pause is not an outage.

Each service card already has a monitor; an interval left unset uses the default. The assessment
does not infer notification intent, evaluate alert channels, or prove complete coverage. It does not
change settings or network permissions. Results can be ignored and are recalculated on refresh;
there is no saved dismissal. The list is limited to the first 100 results. Refresh an old assessment
before acting. This deterministic feature does not require AI.

A **service** is a card on your dashboard. It has an address to open and, optionally, a scheduled check that tells you
whether it is healthy.

![The service form](../screenshots/service-form.png)

## The service form

Open it from **Organize → Add service**, from **Edit** in a row's menu, or with `n`. The essentials are always visible;
the rest is in four tabs.

### Essentials

| Field        | Notes                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**     | Shown on the card and searched by the palette.                                                                                                  |
| **URL**      | An `http` or `https` address, without a user or password; `http://` is added when you leave it out. Every check type uses it.                   |
| **Category** | The group the card belongs to. A new name creates the group.                                                                                    |
| **Icon**     | An emoji, a built-in icon (`lucide:server`), a bundled brand logo (`brand:plex`) or an image URL. The form suggests the logo matching the name. |

An address another card already uses is pointed out, and you can still save. Closing the form after changing something
asks before discarding. What you typed in the card fields also stays in this browser tab if the session expires or the
page reloads, until you save, discard or sign out.

### Appearance tab

- **Description:** optional text shown in the Cards layout.
- **Tags:** press `Enter` or type a comma to add one. Tags filter the dashboard.
- **Open link:** a **new tab** (default) or the **same tab**.

### Monitoring tab

Choose a **check method**, how often it runs, and how Homora interprets the results.

![The Monitoring tab](../screenshots/service-form-monitoring.png)

### Connections tab

Link the card to the **host** it runs on and record the services it **depends on**. See
[Where a service runs and what it needs](#where-a-service-runs-and-what-it-needs).

### Access tab

- **Allow monitoring on a private network** lets Homora probe local addresses such as `192.168.x.x`, for this service
  only. See [The destination policy](#the-destination-policy).
- **Skip TLS verification for this service** is an exception for HTTP and TLS checks on permitted private addresses. It
  can let an attacker impersonate the service and may show an expired certificate as healthy, so the card displays **TLS
  not verified**. Prefer installing your private CA in **Settings → Alerts**.
- **Show on the public status page** includes the service on the optional public page. See
  [Notifications and the public status page](notifications-and-status-page.md#public-status-page-optional-read-only).

## Check types

Every type goes through the same destination policy. Pick the one that answers your question.

| Type                | Asks...                                      | Use it for                                                                                            |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **HTTP(S)**         | Does the address answer with a good status?  | Most web interfaces. Reports the status code and latency.                                             |
| **Ping (ICMP)**     | Does the host answer ping?                   | A machine or appliance with no web page. It says nothing about the service itself.                    |
| **TCP**             | Is the port open?                            | Databases, SSH, MQTT and anything on the LAN that does not speak HTTP. Uses the URL's host and port.  |
| **DNS**             | Does the name resolve?                       | Checking that a host name still points somewhere.                                                     |
| **TLS certificate** | Is the certificate valid, and for how long?  | Reports `expired` or `invalid` as unavailable and `expiring` (within 14 days) while still available.  |
| **Keyword**         | Does the page still contain some text?       | A site that returns 200 even when broken. Case-insensitive, in the first megabyte of a 2xx response.  |
| **JSON**            | Does the response contain an expected value? | An API health endpoint, for example `status=ok`. A bare path means "exists and is not null or false". |

Homora never stores response bodies. A keyword or JSON mismatch is recorded only as the reason `content-mismatch`.

### HTTP options

On the Monitoring tab, included in exports and subject to the destination policy:

- **Check URL** is a separate, complete HTTP(S) address for monitoring, for example a LAN health endpoint when the card
  opens a public address behind Cloudflare Access. It overrides **Check path** for all check types (host checks use its
  host and port). Credentials, query strings and fragments are not accepted.
- **Check path** replaces the path and query of the card URL for the HTTP probe, keeping its origin: `/health` while the
  card opens `/dashboard`. It must start with a single `/`. Empty checks the full card URL.
- **Expected HTTP status** is an exact code such as `200` or `302`, or `2xx` / `3xx`. Any other response is unavailable,
  with the received and expected codes. Empty uses the default classification.

Check path and expected status only apply to HTTP checks. Checks are anonymous and do not follow redirects, so a login
page or access proxy can answer successfully while the service behind it is down; use an anonymous health endpoint when
there is one.

### Private TLS trust

For private HTTPS origins, **Settings → Alerts** accepts a PEM or CRT bundle of up to ten valid certificates (64 KB).
It applies only to HTTP and TLS checks on private addresses, and certificate and hostname validation stay on. Uploading
replaces the bundle. Trust and per-service TLS exceptions are not included in exports.

### Check interval

**Check every (seconds)** accepts 30 to 3600 (default 60). Checks run from the Homora backend, so they reflect what
_Homora_ can reach, not your browser.

### The destination policy

Every check resolves the address and pins it, so a name cannot be switched to a forbidden address mid-check.

- Loopback (`127.0.0.0/8`), link-local and other special ranges are **always blocked**.
- Private LAN addresses are monitored only when **Allow monitoring on a private network** is on for that service.
- **Settings → Alerts → New services allow private network** only sets the starting value of that checkbox in the
  new-service form.
- A card whose destination is not authorized reads **Not monitored** and does not count as a failure: it opens no
  incident and sends no notification.

## States, alerts and incidents

### Alerts and states

**Alerts and states**, in the lower part of the Monitoring tab, controls how results are interpreted. It never changes the
check itself, so history is kept, and it is set only in the web interface, never by imports or agents.

| Setting                                     | Effect                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Failures before it counts as down**       | Consecutive failed checks needed to open an incident and send an alert (default 1). |
| **Successes before it counts as recovered** | Consecutive successful checks needed to close it (default 1).                       |
| **Degraded when slower than (ms)**          | An online service slower than this reads **Degraded**. Off by default.              |

Raise the failure threshold to ignore isolated blips. Notifications use the same thresholds, so a long outage sends **one**
alert.

### The states a card can show

| State              | Meaning                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Online**         | The last check succeeded. A redirect or login prompt counts as online.                                                                     |
| **Offline**        | The check failed. The card says why: no response, error status, content mismatch, certificate problem.                                     |
| **Degraded**       | Online, but slower than the limit you set.                                                                                                 |
| **Maintenance**    | Inside a scheduled window. Checks are paused.                                                                                              |
| **Waiting**        | No result yet.                                                                                                                             |
| **No information** | Homora cannot say, for example after you change a service's settings and before the next check. Unknown checks never count against uptime. |
| **Not monitored**  | The destination is not authorized. See [the destination policy](#the-destination-policy).                                                  |

### Incidents

An **incident** is a run of consecutive failed checks. It opens when a service reaches its failure threshold (starting at
the first failed check) and closes when successes reach the recovery threshold. Unknown checks change nothing. Incidents
feed the dashboard banner and the latency chart markers; reasons use Homora's own terms (`no-response`, `error-status`
with the HTTP code) and response bodies are never shown.

## Uptime and history

![A service's detail page with uptime, latency and incidents](../screenshots/service-detail.png)

- Raw checks are kept for **30 days**, hourly counts for about **100 days** (the 90-day heatmap and the period
  comparison).
- Uptime is shown for **24 hours, 7, 30 and 90 days** and counts only the current check configuration; after you change
  how a service is checked, older results are not mixed in and the page says it was reconfigured.
- Unknown checks are excluded, and no percentage appears until five up or down checks exist.
- The latency chart shows the median (p50) and the 95th percentile (p95). Long ranges are summarized in at most 120
  buckets.
- The **availability target** is 99.9% over 30 days; the remaining allowance is the error budget.
- **Mean time to recover** is the average incident length over 30 days.

Deleting a service deletes its history.

## Scheduled maintenance

On a service's detail page, choose **Schedule maintenance**, pick a start and an end (1 minute to 30 days) and add an
optional note, such as "Disk swap". While a window is open Homora does not probe the service and records _unknown_
with the reason `maintenance`, so uptime, incidents and alerts ignore the period.

- Entering or leaving a window takes effect at the next monitor pass.
- An incident open when maintenance starts stays open until the first success afterwards.
- Windows cannot overlap; you can **End now** or cancel one.
- Only the signed-in person schedules windows (never imports or agents), and each is logged.
- The public status page and notifications do not yet show maintenance as its own state.

## Where a service runs and what it needs

The **Connections** tab models your infrastructure without touching it.

![The Connections tab](../screenshots/service-form-connections.png)

- **Runs on:** link a card to the Proxmox VM or container it runs on (connection, node and guest). Only identifiers are
  stored, so a renamed guest keeps working. If the guest disappears the card shows _Host not found_; if the inventory
  cannot be read, _Host unavailable_. Neither is ever "offline".
- **Suggested hosts:** the dashboard proposes links when it finds independent evidence: the card's address in the guest's
  configuration, or reported by the QEMU guest agent or a Docker source tied to that guest. A name match alone never
  counts. You accept or dismiss each one.
- **Not running on a guest:** a card for something that runs nowhere in your infrastructure (a cloud service, a VPN) can
  be marked **external** on the [map](dashboard.md#service-map). It then stays out of the suggestions and shows under
  **External**.
- **Depends on:** the services this one needs. These links are manual, and Homora refuses one that would create a cycle.
- **Impact:** a service whose host or dependency is impaired is flagged _may be affected_, never as a measured fact.

The **Host** view and **Map** arrange services by host; see the [dashboard guide](dashboard.md#layouts-and-views).

This is Homora's own data; nothing is written to Proxmox or any other system. Links, the external mark and dependencies
are not carried by export and import.

## Tips

- Use a dedicated anonymous health endpoint (such as `/health`) with an **Expected HTTP status**.
- Prefer **Keyword** or **JSON** for apps that return 200 even when degraded.
- Add a **TLS certificate** check to anything exposed over HTTPS to hear about expiry two weeks ahead.
- Use **TCP** for LAN services that are not web interfaces.
- Set **Failures before it counts as down** to 2 or 3 for flaky links.

## Investigate an incident

Choose **Investigate incident** beside an incident in service details or in **Manage → Activity**.
The timeline shows the recorded incident, up to 100 retained checks and up to 20 overlapping
incidents; it marks truncated or invalid records and unknown coverage. Overlap is a hypothesis,
not proof of a shared cause. Check history is retained for 30 days; historical dependencies and
the root cause may be unknown. Times use your browser's time zone. The view is deterministic,
requires no model, starts no checks and makes no external changes.

# Services and monitoring

A **service** is a card on your dashboard. Each one has an address to open and, if you want, a check that runs
on a schedule to tell you whether it is healthy. This guide covers every field of the service form, the check
types, how failures, incidents and uptime are calculated, and how to plan maintenance.

![The service form](../screenshots/service-form.png)

## The service form

Open it from **Manage → Services → Add service**, from a card's edit button, by pressing `n`, or at
`/manage/services/new` and `/manage/services/:id/edit`. The essentials are always visible; the rest is grouped in
four tabs, each with a one-line summary of what it currently holds.

### Essentials

| Field        | Notes                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**     | Shown on the card and searched by the palette.                                                                                                                                                     |
| **URL**      | Must be an `http` or `https` address. Every check type uses it, so a card always has something to open.                                                                                            |
| **Category** | The group the card belongs to. Typing a new name creates the group.                                                                                                                                |
| **Icon**     | An emoji, a built-in icon (`lucide:server`), a bundled brand logo (`brand:plex`) or an image URL. The form suggests the logo that matches the name. Use the search button to browse all 164 logos. |

### Appearance tab

- **Description:** an optional line of text shown in the Cards layout.
- **Tags:** press `Enter` or type a comma to add one. Tags are used to filter the dashboard.
- **Open link:** open the service in a **new tab** (the default) or the **same tab**.

### Monitoring tab

Choose a **check method**, how often to run it, and how Homora should interpret the results.

![The Monitoring tab](../screenshots/service-form-monitoring.png)

### Connections tab

Link the card to the **host** it runs on and record the services it **depends on**. See
[Where a service runs and what it needs](#where-a-service-runs-and-what-it-needs).

### Access tab

- **Allow monitoring on a private network** lets Homora probe addresses on your local network, such as
  `192.168.x.x`. It applies to this service only. See [The destination policy](#the-destination-policy).
- **Show on the public status page** includes the service on the optional public page. See
  [Notifications and the public status page](notifications-and-status-page.md#public-status-page-optional-read-only).

## Check types

Every type goes through the same destination policy. Pick the one that answers the question you care about.

| Type                | Asks...                                      | Use it for                                                                                            |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **HTTP(S)**         | Does the address answer with a good status?  | Most web interfaces. Reports the status code and latency.                                             |
| **Ping (ICMP)**     | Does the host answer ping?                   | A machine or appliance with no web page. It says nothing about the service itself.                    |
| **TCP**             | Is the port open?                            | Databases, SSH, MQTT and anything on the LAN that does not speak HTTP. Uses the URL's host and port.  |
| **DNS**             | Does the name resolve?                       | Checking that a host name still points somewhere.                                                     |
| **TLS certificate** | Is the certificate valid, and for how long?  | Reports `expired` or `invalid` as unavailable and `expiring` (within 14 days) while still available.  |
| **Keyword**         | Does the page still contain some text?       | A site that returns 200 even when broken. Case-insensitive, in the first megabyte of a 2xx response.  |
| **JSON**            | Does the response contain an expected value? | An API health endpoint, for example `status=ok`. A bare path means "exists and is not null or false". |

Homora never stores response bodies. A keyword or JSON mismatch is recorded only as the reason
`content-mismatch`.

### HTTP options

On the Monitoring tab, **Check URL** optionally sets a separate complete HTTP or HTTPS address for monitoring, for example a LAN health endpoint when the card opens a public address behind Cloudflare Access. It takes precedence over Check path for all check types; for host checks, the host and port are used. Credentials, query strings and fragments are not accepted. The private-network permission and destination policy apply to this address. The URL is configuration and is included in native exports and agent proposal reviews.

On the Monitoring tab, **Check path** optionally replaces the path and query of the card URL for the HTTP probe, while keeping its origin. For example, use `/health` to check an endpoint while the card opens `/dashboard`. Leave it empty to check the full card URL. The path must start with a single `/`; a query string is allowed. The destination policy and the service's private-network permission still apply.

**Expected HTTP status** accepts an exact code such as `200` or `302`, or `2xx` / `3xx`. A different response is reported as unavailable with the received and expected codes. Leave it empty to keep the default classification. Both settings are retained when using ping but only apply to HTTP checks, and are included in Homora exports. Checks are anonymous and do not follow redirects: a login page or an access proxy can respond successfully even when the underlying service is down. Use a suitable anonymous health endpoint if one is available.

### Check interval

**Check every (seconds)** accepts 30 to 3600. Leave it empty for the default of 60 seconds. Checks run from the
Homora backend, so they reflect what _Homora_ can reach, not what your browser can reach.

### The destination policy

Every check passes through a destination policy that resolves the address and pins it, so a name cannot be
switched to a forbidden address mid-check.

- Loopback (`127.0.0.0/8`), link-local and other special ranges are **always blocked**.
- Private LAN addresses are monitored only when **Allow monitoring on a private network** is on for that service.
- To save a step for services you add yourself, turn on **Settings → Alerts → New services allow private network**.
  It only sets the starting value of the checkbox in the new-service form. Existing services, imports, Docker
  discovery and agent proposals are unaffected.
- A card whose destination is not authorized reads **Not monitored** and does not count as a failure.

## States, alerts and incidents

### Alerts and states

The lower part of the Monitoring tab, **Alerts and states**, controls how results are interpreted. These settings never
change the check itself, so changing them never erases history. They are set only in the web interface, never by
imports or agent proposals.

| Setting                                     | Effect                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Failures before it counts as down**       | Consecutive failed checks needed to open an incident and send an alert (default 1). |
| **Successes before it counts as recovered** | Consecutive successful checks needed to close it (default 1).                       |
| **Degraded when slower than (ms)**          | An online service slower than this reads **Degraded**. Off by default.              |

Raise the failure threshold to ignore isolated blips. Because notifications use the same thresholds, a long outage
sends **one** alert, not one per check.

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

An **incident** is a period of consecutive failed checks. It opens when a service reaches its failure threshold (its
start time is the first failed check of the streak) and closes at the first run of successes that reaches the recovery
threshold. Unknown checks change nothing. Incidents feed the dashboard banner and the markers on the latency chart. Failure reasons use Homora's own vocabulary (`no-response`, `error-status` with the HTTP
code, and so on); response bodies are never shown.

## Uptime and history

![A service's detail page with uptime, latency and incidents](../screenshots/service-detail.png)

- Raw checks are kept for **30 days**, one row per check. Hourly counts are kept for roughly **100 days**, which is
  what powers the 90-day heatmap and the comparison with the previous period.
- Uptime is shown for **24 hours, 7, 30 and 90 days**. It counts only the current check configuration: if you change
  how a service is checked, older results from a different configuration are not mixed in, and the page tells you the
  service was reconfigured.
- Unknown checks are excluded from the denominator, and no percentage is shown until five up or down checks exist.
- The latency chart shows the median (p50) and the 95th percentile (p95) for a single service. Long ranges are
  summarized in at most 120 buckets.
- The **availability target** is 99.9% over 30 days. The remaining allowance is shown as an error budget.
- **Mean time to recover** is the average length of incidents over 30 days.

Deleting a service deletes its history.

## Scheduled maintenance

On a service's detail page choose **Schedule maintenance**, pick a start and an end (between 1 minute and 30 days)
and add an optional note, for example "Disk swap". While a window is open Homora does not probe the service and
records _unknown_ with the reason `maintenance`, so uptime, incidents and alerts ignore the period automatically.

- Entering or leaving a window takes effect at the next monitor pass, not at the next interval.
- If an incident is open when maintenance starts, it stays open until the first success afterwards.
- A service cannot have overlapping windows, and you can **End now** or cancel one.
- Windows are scheduled only by the signed-in person, never by imports or agents, and are recorded in the activity log.
- The public status page and notifications do not yet show maintenance as its own state.

## Where a service runs and what it needs

The **Connections** tab models your infrastructure without touching it.

![The Connections tab](../screenshots/service-form-connections.png)

- **Runs on:** link a card to the Proxmox VM or container it runs on. You choose the connection, node and guest.
  Only identifiers are stored, so a renamed guest keeps working. If the guest disappears the card shows
  _Host not found_, and if the inventory cannot be read it shows _Host unavailable_, never "offline".
- **Suggested hosts:** on the dashboard, **Suggested hosts** proposes links when it finds independent evidence, such as
  the card's address in the guest's configuration, reported by the QEMU guest agent, or reported by a Docker source you
  tied to that guest. A name match alone never counts. You accept or dismiss each suggestion.
- **Depends on:** record the services this one needs. These links are manual, and Homora refuses a link that would
  create a cycle.
- **Host view and map:** see the [dashboard guide](dashboard.md#layouts-and-views) for pictures of both.
- **Impact:** a service whose host or dependency is impaired is flagged as _may be affected_, always worded as manual
  and as "may", never presented as a measured fact. The **Host** and **Map** views arrange your services by host.

All of this is Homora's own data. It never writes to Proxmox or any other external system. Links and dependencies
are not carried by export and import.

## Tips

- Use a dedicated, anonymous health endpoint when a service has one (for example `/health`) with an **Expected HTTP
  status**.
- Prefer a **Keyword** or **JSON** check for apps that return 200 even when degraded.
- Add a **TLS certificate** check for anything exposed over HTTPS so you hear about expiry two weeks ahead.
- Use **TCP** for LAN services that are not web interfaces.
- Raise **Failures before it counts as down** to 2 or 3 for flaky links so you only hear about real outages.

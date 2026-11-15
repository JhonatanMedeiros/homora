# ADR 0025: Release notes and update indicator

Status: Accepted

## Context

Users need recent release notes and a way to see a newer stable release. Homora is local-first and must work without GitHub. Its credentials, configured hostnames, services and inventories must not be sent to third parties.

## Decision

While a user is signed in, the browser requests release information from the Homora backend on initial load and every six hours while open. The backend retrieves the fixed public GitHub Atom feed for Homora releases, using the existing restricted transport: HTTPS, public destination policy, DNS pinning, no redirects, an eight-second timeout and a 512 KB response cap. No user-supplied destination or credentials are used; the source server's public IP is visible to GitHub. No hostname, service data, inventory, browser origin or credentials are included. The backend caches successful responses in memory for six hours and failures for one minute, deduplicates concurrent requests and discards the cache on restart. There is no background job without an authenticated browser requesting information. The route requires a web session.

The client parses XML without DTDs or entities, reads at most 20 entries and converts release HTML to a bounded plain-text subset with safe GitHub links. The content is untrusted and HTML is never executed. SemVer pre-release tags are excluded. A newer version is indicated only when the running build has an identified release tag and a valid comparison proves it is older; a source build without a tag has an unknown update state. The app never installs updates.

Failures, rate limits, private repositories or blocked outbound access leave the dashboard usable and show an error with retry. The browser retains a previously fetched in-memory result on refresh failure and discards it on reload. Long notes are truncated with a link to the full release. The feed has limited history and uses GitHub's entry update date.

## Alternatives and consequences

Bundling the local changelog works offline but cannot indicate newer versions. A direct browser request avoids a server-side request but discloses each browser IP and potentially the Homora origin through CORS. The fixed server-side request reuses existing destination, DNS and redirect controls and centralizes caching, but requires outbound Internet access and reveals the server IP to GitHub. Deployments that block GitHub can continue to use Homora without release notes or update checks.

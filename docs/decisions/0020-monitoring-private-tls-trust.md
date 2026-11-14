# 0020: TLS trust for private monitoring targets

Status: Accepted

## Context

Homelab origins can use a private CA or a self-signed certificate. The monitor must be able to
check those services without disabling verification for public addresses or other integrations.

## Decision

An administrator can install a bounded PEM certificate bundle for monitoring. It adds to the
default trust roots only for HTTP and TLS checks when the service permits private networking and
the authorized, pinned address is in a private range. Hostname and certificate validation remain
enabled. The bundle stays local to the installation and is not included in configuration exports.
Its hash participates in the monitoring signature for eligible services, so changes cause new
checks and separate histories. Invalid or expired stored bundles are not used and are reported in
settings. Changes are audited without recording the PEM.

A separate per-service exception lets an administrator disable TLS verification for HTTP and TLS
checks. It is off by default, requires the per-service private-network permission, and is applied
only after the pinned address is confirmed private. The card shows the exception; the service form
explains its risk. A proposal includes the field in its review diff and approval is audited. Native
exports do not transfer the exception. TLS checks still report certificate expiry, even when the
exception allows an expired or untrusted certificate to be classified as reachable.

## Alternatives and consequences

Trusting a private CA preserves chain and hostname checks and is preferred. Disabling verification
allows an attacker on the private network to impersonate a service and can make an expired
certificate appear healthy. Neither option changes destination authorization, DNS pinning or
redirect rules. Trust and exceptions should be reviewed when network topology changes.

## Validation

Automated tests cover the store, routing, private-address restriction, exception grants, audit,
signatures and migration. Live deployment and browser validation must be reported separately.

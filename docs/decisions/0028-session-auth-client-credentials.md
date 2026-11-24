# 0028 — Client-credentials login for session authentication

**Status:** Accepted for the built-in TP-Link Omada integration; implemented, not validated against a
live Controller through Homora. Extends [ADR 0018](0018-integration-session-auth.md).

## Context

The TP-Link Omada Open API exchanges an OAuth client credential for an access token:
`POST /openapi/authorize/token?grant_type=client_credentials` with `omadacId`, `client_id` and
`client_secret` in a JSON body. The token is sent as `Authorization: AccessToken=<token>`. A
rejected exchange answers HTTP 200 with a nonzero `errorCode`, so the HTTP status alone is not a
verdict. The ADR 0018 profile had no fixed query string, no way to check a success code and no such
authorization format. Reads also report problems inside an HTTP 200 envelope.

User-reported API tests on Controllers 5.15.24.19 and 6.3.0.111 (Viewer role) show: a Bearer header
returns HTTP 200 with `errorCode -44112`; an invalid credential returns HTTP 200 with `-44106`; a
malformed header returns HTTP 400. They are evidence for those environments, not for Homora.

## Decision

Widen the host-owned `sessionAuth` profile in three closed, generic ways. The registration owns the
wire values; the host validates them and builds the request. No new method, header name, path
style or user-editable value is introduced.

1. **`loginQuery`**: at most four fixed parameters appended to the login URL by the host. Names
   match `[a-z][a-z0-9_]{0,31}`, are unique ignoring case and may not look like a credential
   (`secret`, `passw`, `token`, `key`, `auth`, `sid`, `sig`). Values match `[A-Za-z0-9_.-]{1,64}`
   and may not equal the connection's secret or client ID. Encoding is done with `URLSearchParams`.
   The path stays strict and path-only; connection values never reach the query.
2. **`successCode`**: a fixed path and integer that the login response must hold exactly
   (`errorCode === 0`). A missing, mistyped or different code fails with the fixed
   `Integration authentication failed.`; the remote message is never read.
3. **`sendAs: { type: 'authorization', scheme }`**: the scheme is a member of a closed list
   (currently `access-token`, rendered `AccessToken=<token>`). The token must still match its
   declared format, so it cannot carry whitespace or control characters.

Everything else from ADR 0018 is unchanged: HTTPS only, destination authorization, DNS pinning,
TLS and hostname verification with the per-connection CA, no redirects, a 16 KB login response,
session isolation per connection revision, deduplicated concurrent logins, a bounded lifetime
(the server's `expiresIn`, capped at 24 hours, minus a safety margin), invalidation on edits and
one retry after HTTP 401. The refresh token is never read, stored or sent; there is no refresh
exchange. Omada's registration declares body keys `omadacId` (public, identity), `client_id`
(`tokenId`, identity) and `client_secret` (`secret`).

### Error codes on reads

The adapter, not the host, inspects `errorCode` in read responses. `-44112` is **not** treated as
expiry: the same code was observed for a wrongly formatted header. The host therefore retries only
HTTP 401 and renews only on its own expiry. The Omada adapter does map `-44106` and `-44112` to a
fixed "credentials or permissions rejected" error, which pauses automatic reads for 60 seconds
like other rejected credentials. A generic body-based retry would need a separately reviewed
contract and a reliably verified expired-token condition; neither exists.

## Not decided

- **POST statistics (historical device metrics).** The documented per-device statistics are POST.
  Nothing here permits them, and no read POST capability exists. It needs its own service-neutral
  design (schema, allowed paths and bodies, limits, concurrency, policy, tests) and review. Until
  then history is blocked; the GET summary ships independently.
- **API key (`Bearer`)**, documented for Controller 6.4+: not implemented or assumed on 5.15/6.3.
- **Pre-login `GET /api/info`** and a site picker: the transport logs in before every read, so
  discovery needs a separate reviewed capability. Site and Omada IDs are entered manually.
- Hostname-verification bypass: not added. The Controller name must resolve in the backend and
  match the certificate SAN.

## Verification

Transport tests cover the fixed query and body, the enumerated header, a nonzero or missing code
on HTTP 200, malformed tokens and expiry, expiry and renewal, concurrent logins, HTTP 401 retry
limits, unsafe or duplicated queries (injection, encoded separators, credential-looking names,
credential values, too many entries), unknown authorization schemes and success codes, and that the
Pi-hole profile is unchanged. A synthetic second profile (tenant, client ID and secret, nested
result) shows the contract is not Omada-specific. The Omada connection tests run the real
transport with a mocked network layer. None of this replaces a live validation.

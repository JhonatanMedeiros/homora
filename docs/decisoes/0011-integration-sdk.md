# ADR 0011: Internal integration SDK

## Status

Accepted for the built-in read-only integrations; no external plugin loading is introduced.

## Context

The declarative interpreter already generates forms and widgets from definitions, but definitions,
fixtures, special adapters and presentation logic were spread across the applications. This made
contributions and review harder, and risked divergent metadata between registrations and forms.

## Decision

Use the private `@homora/integrations` workspace package. Its root exports static definitions and
shared contracts; `/backend` exposes the adapter, restricted transport and registration contracts;
`/frontend` exposes the presentation contract and declarative display renderer. Each integration
has a directory containing its definition, fixtures, contract test and, when needed, backend and
frontend implementations. Backend-only modules have separate exports so browser imports do not
include Node dependencies. Existing `@homora/shared` exports remain as compatibility reexports.

Definitions and executable hooks are explicitly registered at build time. The application owns
transport implementation, destination and DNS policy, vault access, input errors, persistence,
authentication, and capability-specific routes. It injects transport and host-specific validation
into adapters; no integration can opt into a new network method or header through this contract.
Only read-only GETs are supported. Code for third-party plugins is not loaded dynamically.

The test harness remains in the backend because it exercises its registry, cache and host error
handling. Each integration supplies contract cases alongside its fixtures. The generator creates
unregistered templates with illustrative data and never overwrites an existing integration; it does
not assert compatibility with any service.

## Consequences

IDs, field names and existing data formats must remain stable; this reorganization needs no data
migration. Code adapters may need small host registration modules and explicit presentation exports.
The internal API can evolve with the monorepo; publishing it as a third-party SDK would require a
separate versioning, compatibility and security decision. A mocked contract test and a build do not
replace live-service validation.

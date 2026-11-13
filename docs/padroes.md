# Engineering Standards

This document establishes conventions to keep Homora simple, predictable, and
secure as it grows. It serves as an implementation guide, not a mandate to introduce
premature abstractions or unnecessary layers. Module boundaries and current constraints
are documented in [architecture](arquitetura.md).

## Module Boundaries

- `apps/frontend` presents and collects data; it never accesses SQLite, local files,
  integration credentials, or infrastructure APIs directly.
- `apps/backend` is the trusted boundary for authentication, authorization, validation,
  business logic, integrations, and persistence.
- `packages/shared` contains shared schemas, types, and pure utility functions. It never
  imports application-specific code, Node-only runtime modules, or secrets.
- `packages/db` defines the SQLite schema, migrations, and technical database access.
  Authorization logic and product workflows belong in application services, not
  in the database schema.
- Organize code by capability (services, connections, proposals, agents), avoiding
  premature generic abstractions. `createApp` should compose HTTP route modules;
  each route module should delegate reusable domain rules to testable functions.
- Prevent circular dependencies between capabilities. Expected control flow is
  UI → API/application service → persistence or external adapter.

## Interface (Frontend)

- The UI is built with React, Tailwind CSS v4, and shadcn/ui (Radix primitives,
  `new-york` style, lucide icons). `apps/frontend/components.json` configures the CLI;
  the `shadcn` skill in `.agents/skills/shadcn` guides agents. Add primitives with
  `npx shadcn@latest add <component>` (inside `apps/frontend`) and review generated files:
  this project's CLI may generate `cn` imports as `"cn"`; correct them to `@/lib/utils`.
- Every UI element is a component: primitives live in `src/components/ui`
  (shadcn, aligned with tokens), product components in `src/components`
  (`StatusLight`, `ServiceCard`, `AppSidebar`...), pages in `src/pages`,
  and capability modules in `src/features`. State and API calls reside in
  `src/hooks`; pure business rules in `src/lib`.
- Prefer an existing shadcn primitive for every interactive control and reusable
  visual pattern before writing custom markup. Use `Button`, `Input`, `Textarea`,
  `FormSelect` (composed from shadcn `Select`), `Checkbox`, `Switch`, `ToggleGroup`,
  `RadioGroup`, `Label`, `Card`, `Badge`, `Alert`, `Empty`, `Separator`, and the
  matching overlay primitives as appropriate. Product components should compose these
  primitives and add only product behavior or layout. Do not introduce raw `<button>`,
  `<input>`, `<select>`, or `<textarea>` in feature/page code when a project primitive
  fits. Exceptions include semantic links, structural HTML, file inputs that cannot be
  represented by the current primitive API, and cases where native behavior is a
  documented accessibility or platform requirement. Keep raw elements inside
  `src/components/ui` implementations; do not edit those files as product call sites.
- For sets of a few mutually exclusive choices, compose shadcn `ToggleGroup` or
  `RadioGroup`; do not build option cards from custom labels and hidden native inputs.
  Form labels and descriptions use `Field`/`FieldLabel`/`FieldDescription` and controls
  must have an accessible name (for composite controls, use `aria-label` or
  `aria-labelledby`).
- Styling must use semantic tokens (`bg-primary`, `text-muted-foreground`),
  defined in `src/style.css` and documented in `DESIGN.md`. Do not use hardcoded colors,
  `space-*` utilities, inline ad-hoc CSS per screen, or legacy generic utility classes.
  `className` is for layout, not for overriding component colors or typography.
- Forms use `FieldGroup`/`Field`; alerts use `Alert`; empty states use `Empty`;
  service status always uses `StatusLight` (light, text, and color). Theming is driven by
  the `dark` class on `<html>` (`useTheme`).
- Loading and feedback follow one pattern:
  - **Initial load of a list, page or card region**: render a skeleton that mirrors the
    final layout, never a bare spinner or "Loading..." text. Reuse or add a composition in
    `src/components/skeletons.tsx` (built on the shadcn `Skeleton`) and wrap it in
    `LoadingRegion`, which announces the label once (`role="status"`, `aria-busy`) and
    hides the placeholder shapes from assistive technology. Pass the existing `*.loading`
    i18n text as the label. Skeletons honor `prefers-reduced-motion`.
  - **Submit or action in progress**: disable the button and show
    `<Spinner data-icon="inline-start" />` before its label. When several buttons share one
    `busy` flag, put the spinner only on the one that was pressed.
  - **Refreshing data already on screen** (polling): keep the current content; do not
    swap it back to a skeleton.
  - **Outcome**: use the shared `sonner` toaster for the result of explicit actions, with
    success, error or warning according to the result. Keep field validation, load failures
    and partial results inline when they need persistent context; avoid repeating transient
    success messages inline. Never put credentials or tokens in a toast. Do not skeleton a
    region whose absence is a valid state for users
    without Proxmox or integrations (for example the top bar telemetry), to avoid flicker.
  - Keep the skeleton shape close to the real component so the page does not shift when
    data arrives, and cover new compositions with a small test (see `skeletons.test.tsx`).
- Files in `src/components/ui` mirror upstream shadcn; ESLint exempts them
  from Fast Refresh and pure-render checks.

## Contracts and Validation

- Validate untrusted data at ingress: request bodies, URL params, query parameters,
  environment variables, serialized database fields, and external HTTP responses.
- Prefer Zod schemas in `packages/shared` when the same contract is shared across
  frontend and backend. Backend-specific validation may remain in the backend.
  Use strict schemas at HTTP boundaries to reject unknown fields; keep normalization
  and domain rules in the functions that own them. Convert validation errors into safe,
  stable messages without leaking raw payloads or Zod internal stack details. Never use
  `as` type assertions as a substitute for runtime validation at external boundaries.
- Validate serialized data read from the database or encrypted vault before treating
  it as typed data. For credential payloads, do not log input contents or validation
  internals in route errors or server logs.
- HTTP endpoints and MCP tools must return explicit DTOs. Never return raw database
  rows that may contain secrets, password hashes, API tokens, internal references,
  or unapproved fields.
- Errors must present safe, user-friendly messages; internal details must never expose
  credentials, Authorization headers, tokens, or sensitive payloads. Distinguish between
  invalid input, unauthorized, conflict, and upstream failure.

## Persistence and Concurrency

- Every schema modification requires a versioned migration compatible with existing data,
  accompanied by tests verifying data preservation and default values. Use isolated
  temporary databases in tests; never delete user databases or backups.
- Group operations that comprise a single business decision within the same SQLite
  transaction (e.g., proposal creation alongside audit event logging). Handle conflicts
  and idempotent retries explicitly.
- In-memory caches must have documented scope, TTL expiration, invalidation triggers,
  and failure handling. In-memory state returns to initial defaults upon server restart.
- Secrets must never appear in API responses, logs, test snapshots, or test fixtures.
  Encrypted data and encryption keys share a documented, unified backup and recovery lifecycle.

## Integrations and Security

- Each adapter validates its own configuration and transforms external responses into
  strongly typed models. Failures, missing payload fields, or API version mismatches must
  not disrupt unrelated functionality.
- External calls must go through the shared destination and network transport policy:
  explicit private network authorization when required, validated DNS and pinned IP address,
  no following redirects, validated TLS, aggressive timeouts, and response body size limits.
- Agent tokens are scoped, revocable, rotatable, and stored as cryptographic hashes.
  Agent writes create reviewable proposals; human approval applies to the exact displayed diff.
- Treat names, descriptions, URLs, inventories, and external API responses as untrusted
  data. Never execute them as code, shell commands, or instructions.
- Do not introduce write capabilities to integrations, shell execution, unrestricted
  network discovery, or access to internal network endpoints without formal authorization
  policy and security review.

## Testing and Documentation

- Test observable behavior. Cover pure rules with unit tests, routes with temporary
  databases, and integrations with mocked network transports; test migrations independently.
  Do not depend on live networks or external infrastructure in standard test suites.
- When modifying authorization, contracts, persistence, integrations, or security,
  include negative and failure test cases alongside happy paths.
- Execute checks commensurate with the scope of changes (`pnpm check` and `pnpm build`
  for broad changes; targeted unit tests for isolated edits) and report exact test results.
- Keep documentation up to date: README for setup/usage; architecture for boundaries
  and designs; evolution plan for validated progress; this document when conventions evolve.
- For architectural decisions with lasting impact, create `docs/decisoes/NNNN-title.md`
  documenting context, decision, alternatives, consequences, and status. ADRs are not
  required for local refactorings.

## Criteria for New Abstractions

Before introducing a new layer, interface, framework, or dependency, explain the
concrete duplication or risk it eliminates and who consumes it. Prefer two small,
explicit implementations over a complex, speculative abstraction. Extract services,
ports, or repositories only when doing so reduces tangible coupling, shares a rule,
or simplifies testing without obscuring execution flow.

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application architecture
- Fiscal/DANFSe and E0014 rules: `src/lib/AGENTS.md`; official ZIP stays intact.
- Webhook dispatch runs on Cloudflare Workers: enforce HTTPS, no URL credentials, public IPv4/IPv6 and DNS checks before each attempt, and no redirects. Per the owner's accepted network model, do not pin destination IPs or introduce a separate egress service; DNS preflight is not a rebinding-proof connection guarantee.
- Google Cloud Scheduler wakes the database-backed webhook processor once per minute through an OIDC-protected /api/public/ callback; do not use Inngest. All delivery and three-day failure state remains in PostgreSQL.
- Webhook secrets use server-only AES-GCM envelopes bound to endpoint IDs; a shared sender preserves raw event bodies, signs attempts, and uses database leases for immediate and scheduled delivery.
- Domain map: `notemfiscal.com.br`, www and the .lovable.app address 301 to `app.notemfiscal.com.br` (panel + `/api/v1`, noindex); `docs.notemfiscal.com.br` serves the public docs. Routing is the pure src/lib/hosts.ts, first in src/server.ts; docs rules in src/docs-site/AGENTS.md.
- Keep the partner contract in docs/api/ (one file per public page) and implementation notes in docs/interno/; validate OpenAPI 3.1 and its examples in Vitest via Python so invalid specifications fail tests. Update the contract with each API change.
- Integration API reachability must be verified externally before Phase 3A schema work; use only one official base, preserving the approved feasibility-first order.
- Integration mutations authorize the session before using service-role-only RPCs; key generation locks the integration row, stores only hashes and returns the key once with no-store headers. Explicitly revoke inherited table grants before granting safe key columns.
- API log persistence uses request-scoped waitUntil when available and otherwise awaits the write; both paths catch persistence failures without exposing credentials or internal errors in responses.
- Municipality lookups use an authenticated server function and an invoker SQL RPC backed by immutable unaccent/trigram normalization; keep catalog existence separate from filtered results so an empty catalog is never mistaken for a failed match.
- Fiscal catalogs reuse indexed immutable normalization with invoker search RPCs; fiscal forms use authenticated server functions and organization-scoped query loaders/RLS.
- Guided fiscal labels are separate from persisted codes; validate company-level optional withheld-Simples ISS rates and approximate-tax rules in shared schemas and database triggers without rewriting legacy settings on read.
- DPS series allocation locks by CNPJ and retains all previous series; number reservation is a separate committed service-role-only RPC after authenticated role validation, with no release/recycle operation, so future issuance failure leaves gaps.
- Database triggers protect company CNPJ after any certificate or assigned DPS series and serialize certificate/series assignment against company updates; do not synchronize fiscal CNPJ on edits.
- Keep tenant data and organizational roles scoped by organization IDs with database RLS; global administration is a separate protected table to prevent privilege escalation.
- Ordinary panel private reads and mutations use authenticated TanStack server functions and loader/query options; privileged invitations authorize the caller before importing the admin client.
- Certificate files and passwords pass through authenticated panel server functions only in memory and are forwarded to the private transmissor (Google ID token from a server-only service account); only the transmissor holds the envelope key, the panel stores the opaque envelope in a service-role-only table and never logs or returns it.
- Keep protected pages under `_authenticated` and public password/OAuth return pages outside it; the shared shell renders children through Outlet.
- Database triggers own company state derivation, audit fields and immutable organization slugs; forms must not become the authority for these rules.
- Invitation acceptance is an authenticated atomic database function, never an auth-user creation trigger; existing accounts must explicitly accept pending invitations.
- Keep English database/code identifiers and Portuguese user-facing labels separated; theme values belong in semantic CSS tokens.
- Panel tokens only under `html[data-surface="panel"]`; docs keep base tokens (test-enforced, with contrast).
- Preserve the preview auth broker through a storage adapter that chooses persistent or tab-only session storage; never represent “remember me” with a flag alone.
- Shared brand rendering lives separately from auth screens so the app shell does not import login logic; theme selects transparent wordmark variants and collapsed navigation uses the icon.
- The `transmissor/` folder holds a separate service, published on Google Cloud Run, responsible exclusively for signing and transmitting fiscal documents; Lovable must never create, edit, move or delete files inside `transmissor/`.
- Always reply to the user in Brazilian Portuguese (pt-BR); the project owner works in Portuguese.
- Displayed URLs and e-mail links (redirectTo) come from the single official-address module `src/lib/app-url.ts`, never from the current page/request origin; internal navigation and OAuth return stay relative so previews keep working.
- The database generates every new organization's panel address on insert (normalized name, max 30 chars, plus a random 6-char suffix without ambiguous characters, retried on collision) and ignores client-supplied values; addresses stay immutable and organization names may repeat (the panel only warns).
- Every /api/v1 route (including /status) goes through the shared `apiRoute` runtime (key auth, X-Request-Id, streamed 200 KB body cap, idempotency table, minimized logs with company, waitUntil); handlers use the service client but always scope by the key's organization, so isolation and audit (origin + integration) stay uniform.
- Company readiness has one pure calculation shared by API and panel; change detection lives in a service-only state table so `empresa.situacao_alterada` fires once per change.
- API usage limits live in `src/lib/api-policy.ts` and are counted in service-role-only PostgreSQL counters/slots with per-organization overrides (no client access); a counter outage fails open and is logged so the fiscal API never stops because of the limiter.
- Registration changes made with sandbox keys are recorded by `apiRoute` and shown on every organization page until an owner/admin acknowledges them, because company records are shared between environments.
- Public refusal text for fiscal builders comes only from `RuleError`; any other caught error maps to a fixed message so library/internal text never reaches partners.
- New public tables inherit broad default grants here: every migration revokes anon/authenticated and grants back only what the policies need (column grants for partial updates).
- Panel server functions that read with the service role first check organization membership or platform admin server-side (`requireOrgMember`).
- zod is imported only through `src/lib/validation.ts` (lint and test enforced), which installs notem's Portuguese error map and pins the e-mail, date-time and integer rules; field messages win, API path/query/body IDs share the strict UUID rule (`idParam`), and `src/test/validation-messages.snapshot.json` must stay identical, so library updates never change partner-facing text.
- Panel lists, Início counts and exports share one SQL filter source: rules in `src/lib/AGENTS.md`.
- Password creation screens share one rule module (password-rule.ts) and login-service errors reach users only through auth-messages.ts (codes/reasons, never service text), so every screen enforces and words refusals identically.
- `public/brand/email/notem-logo-email.png` is the fixed logo URL of the Supabase e-mail templates: never rename, move or remove it; `/brand/` stays public (no login, no redirect on app., not routed to docs); size/format test-enforced.

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
- Preserve the preview auth broker through a storage adapter that chooses persistent or tab-only session storage; never represent “remember me” with a flag alone.
- Shared brand rendering lives separately from auth screens so the app shell does not import login logic; theme selects transparent wordmark variants and collapsed navigation uses the icon.
- The `transmissor/` folder holds a separate service, published on Google Cloud Run, responsible exclusively for signing and transmitting fiscal documents; Lovable must never create, edit, move or delete files inside `transmissor/`.

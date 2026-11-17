# Panel routes
- Panel loaders throw notFound() for missing or foreign records and PanelAccessDenied for role refusals; router defaults render pt-BR screens inside the shell, so internal text never shows and foreign records look missing.
- The post-login destination passes only through `src/lib/safe-redirect.ts` (validated when saved and when read, deleted after use) to prevent open redirects.
- Panel `?aba=` values are stable codes from `src/lib/panel-tabs.ts` (legacy names converted in beforeLoad) and list filters live in the address via `src/lib/list-search.ts`, so links survive label changes.
- Received notes have their own routes under `notas/recebidas/` and server functions that resolve the document only through `findReceivedNote` (proof of possession), so an emitted and a received note never share a detail page or loader.
- Old addresses, organization-switch targets and the environment rule live in the pure `src/lib/panel-nav.ts`; screens that follow the selector query only the selected environment, so routes, shell and tests share one policy.
- Password change verifies the current password with a separate non-persisted client, then revokes the other sessions server-side with the caller's token (scope "others"), so the current session survives and failures stay generic.

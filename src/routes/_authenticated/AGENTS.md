# Panel routes
- Panel loaders throw notFound() for missing or foreign records and PanelAccessDenied for role refusals; router defaults render pt-BR screens inside the shell, so internal text never shows and foreign records look missing.
- The post-login destination passes only through `src/lib/safe-redirect.ts` (validated when saved and when read, deleted after use) to prevent open redirects.
- Panel `?aba=` values are stable codes from `src/lib/panel-tabs.ts` (legacy names converted in beforeLoad) and list filters live in the address via `src/lib/list-search.ts`, so links survive label changes.

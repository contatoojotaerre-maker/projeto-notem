# Public documentation site
- docs.notemfiscal.com.br is plain server-rendered HTML built at build time from docs/api (virtual:notem-docs) plus one small script; it never loads the panel bundle, login session or database, so no key or session reaches the docs.
- docs/api is the only source (never docs/interno); generated tables (limits, rejections, operations) come from the same code modules as the API/panel so they cannot drift.
- app. only gains noindex; new security headers apply to docs only, keeping panel/API headers unchanged.

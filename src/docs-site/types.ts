/** Data produced at build time from docs/api (Markdown + openapi.yaml) and served by the docs handler. */
export type TocItem = { id: string; text: string; level: 2 | 3 }
export type DocPage = {
  /** Site path without base, e.g. "/" or "/guias/emissao". */
  path: string
  /** Source file relative to docs/api, or "openapi.yaml#operationId" for reference pages. */
  source: string
  title: string
  menu: string
  description: string
  section: string
  group?: string
  updated: string | null
  method?: string
  route?: string
  /** Pre-rendered HTML; internal links start with the /__DOCS__ placeholder (replaced by the base at render time). */
  html: string
  aside?: string
  toc: TocItem[]
}
export type NavItem = { path: string; title: string; method?: string | undefined }
export type NavGroup = { title: string; items: NavItem[] }
export type NavSection = { title: string; items: NavItem[]; groups: NavGroup[] }
export type SearchEntry = { p: string; t: string; h: string; s: string; x: string }
export type DocsSite = { pages: DocPage[]; nav: NavSection[]; search: SearchEntry[]; llms: string; problems: string[]; openapi: string }
export const BASE_TOKEN = '/__DOCS__'

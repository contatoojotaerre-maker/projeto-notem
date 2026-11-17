// Vite plugin: exposes the documentation built from docs/api as the server-only module "virtual:notem-docs".
import path from 'node:path'
import type { Plugin } from 'vite'
import { buildDocsSite } from './build'

const ID = 'virtual:notem-docs'
const RESOLVED = '\0' + ID

export function notemDocs(): Plugin {
  let root = process.cwd()
  return {
    name: 'notem-docs',
    configResolved(c) { root = c.root },
    resolveId(id) { return id === ID ? RESOLVED : undefined },
    load(id) {
      if (id !== RESOLVED) return
      const site = buildDocsSite(root)
      for (const p of site.problems) this.warn(`documentação: ${p}`)
      this.addWatchFile(path.join(root, 'docs', 'api', 'openapi.yaml'))
      return `export default ${JSON.stringify(site)}`
    },
    configureServer(server) {
      const dir = path.join(root, 'docs', 'api')
      server.watcher.add(dir)
      const refresh = (file: string) => {
        if (!file.startsWith(dir)) return
        for (const env of Object.values(server.environments)) { const m = env.moduleGraph.getModuleById(RESOLVED); if (m) env.moduleGraph.invalidateModule(m) }
      }
      server.watcher.on('change', refresh); server.watcher.on('add', refresh); server.watcher.on('unlink', refresh)
    },
  }
}

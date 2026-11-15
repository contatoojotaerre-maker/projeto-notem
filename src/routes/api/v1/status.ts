import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'
import { envLabel } from '@/lib/api-contract'

// Same runtime as every /api/v1 route: key authentication, limits, X-Request-Id and minimized logs.
export const Route = createFileRoute('/api/v1/status')({
  server: { handlers: apiRoute({ GET: async ctx => {
    const org = await ctx.db.from('organizations').select('id,name').eq('id', ctx.organization_id).single()
    if (org.error) throw new Error('ORG_READ_FAILED')
    return { status: 200, body: { ambiente: envLabel(ctx.env), organizacao: { id: org.data.id, nome: org.data.name }, integracao: { id: ctx.integration_id, nome: ctx.integration_name } } }
  } }) },
})

import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

export const Route = createFileRoute('/api/v1/empresas/$id/situacao/')({
  server: { handlers: apiRoute({ GET:(c)=>import('@/lib/api-companies.server').then(x=>x.getSituation(c)) }) },
})

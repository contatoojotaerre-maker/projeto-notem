import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

export const Route = createFileRoute('/api/v1/empresas/$id/servicos/')({
  server: { handlers: apiRoute({ GET:(c)=>import('@/lib/api-companies.server').then(x=>x.listServices(c)),POST:(c)=>import('@/lib/api-companies.server').then(x=>x.createService(c)) }) },
})

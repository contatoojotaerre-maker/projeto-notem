import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

export const Route = createFileRoute('/api/v1/empresas/$id/servicos/$servicoId')({
  server: { handlers: apiRoute({ GET:(c)=>import('@/lib/api-companies.server').then(x=>x.getService(c)),PATCH:(c)=>import('@/lib/api-companies.server').then(x=>x.patchService(c)) }) },
})

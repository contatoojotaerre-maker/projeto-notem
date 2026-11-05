import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

export const Route = createFileRoute('/api/v1/empresas/$id/configuracao-fiscal')({
  server: { handlers: apiRoute({ GET:(c)=>import('@/lib/api-companies.server').then(x=>x.getFiscal(c)),PUT:(c)=>import('@/lib/api-companies.server').then(x=>x.putFiscal(c)) }) },
})

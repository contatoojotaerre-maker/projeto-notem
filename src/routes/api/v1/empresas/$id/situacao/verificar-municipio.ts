import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

export const Route = createFileRoute('/api/v1/empresas/$id/situacao/verificar-municipio')({
  server: { handlers: apiRoute({ POST:(c)=>import('@/lib/api-companies.server').then(x=>x.verifyMunicipality(c)) }) },
})

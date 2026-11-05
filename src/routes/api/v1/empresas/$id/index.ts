import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

export const Route = createFileRoute('/api/v1/empresas/$id/')({
  server: { handlers: apiRoute({ GET:(c)=>import('@/lib/api-companies.server').then(x=>x.getCompany(c)),PATCH:(c)=>import('@/lib/api-companies.server').then(x=>x.patchCompany(c)),DELETE:(c)=>import('@/lib/api-companies.server').then(x=>x.deleteCompany(c)) }) },
})

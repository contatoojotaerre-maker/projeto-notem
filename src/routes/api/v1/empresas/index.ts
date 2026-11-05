import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

export const Route = createFileRoute('/api/v1/empresas/')({
  server: { handlers: apiRoute({ GET:(c)=>import('@/lib/api-companies.server').then(x=>x.listCompanies(c)),POST:(c)=>import('@/lib/api-companies.server').then(x=>x.createCompany(c)) }) },
})

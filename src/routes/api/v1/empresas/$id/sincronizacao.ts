import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

// Read only: synchronization is requested in the panel; the API never starts an NSU synchronization.
export const Route = createFileRoute('/api/v1/empresas/$id/sincronizacao')({
  server: { handlers: apiRoute({ GET: (c) => import('@/lib/api-received.server').then(x => x.getSync(c)) }) },
})

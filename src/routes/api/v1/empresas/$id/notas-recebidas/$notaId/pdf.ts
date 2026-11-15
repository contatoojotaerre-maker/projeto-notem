import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/api.server'

export const Route = createFileRoute('/api/v1/empresas/$id/notas-recebidas/$notaId/pdf')({
  server: { handlers: apiRoute({ GET: (c) => import('@/lib/api-received.server').then(x => x.getReceivedPdf(c)) }) },
})

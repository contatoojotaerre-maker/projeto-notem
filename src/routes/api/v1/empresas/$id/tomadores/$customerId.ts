import { createFileRoute } from '@tanstack/react-router';
import { apiRoute } from '@/lib/api.server';
export const Route = createFileRoute('/api/v1/empresas/$id/tomadores/$customerId')({ server: { handlers: apiRoute({ GET: c => import('@/lib/api-customers.server').then(x => x.getCustomer(c)), PATCH: c => import('@/lib/api-customers.server').then(x => x.saveCustomer(c, true)) }) } });
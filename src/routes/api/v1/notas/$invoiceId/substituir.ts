import { createFileRoute } from '@tanstack/react-router';
import { apiRoute } from '@/lib/api.server';
export const Route=createFileRoute('/api/v1/notas/$invoiceId/substituir')({server:{handlers:apiRoute({POST:async ctx=>(await import('@/lib/api-invoices.server')).substituteInvoice(ctx)})}});

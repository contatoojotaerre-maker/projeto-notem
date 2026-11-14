import { createFileRoute } from '@tanstack/react-router';
import { apiRoute } from '@/lib/api.server';
export const Route=createFileRoute('/api/v1/notas/$invoiceId/')({server:{handlers:apiRoute({GET:async ctx=>(await import('@/lib/api-invoices.server')).getInvoice(ctx)})}});
import { createFileRoute } from '@tanstack/react-router';
import { apiRoute } from '@/lib/api.server';
export const Route=createFileRoute('/api/v1/notas/')({server:{handlers:apiRoute({GET:async ctx=>(await import('@/lib/api-invoices.server')).listInvoices(ctx),POST:async ctx=>(await import('@/lib/api-invoices.server')).createInvoice(ctx)})}});
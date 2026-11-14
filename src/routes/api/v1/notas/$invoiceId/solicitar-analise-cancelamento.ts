import { createFileRoute } from '@tanstack/react-router';
import { apiRoute } from '@/lib/api.server';
export const Route=createFileRoute('/api/v1/notas/$invoiceId/solicitar-analise-cancelamento')({server:{handlers:apiRoute({POST:async ctx=>(await import('@/lib/api-invoices.server')).requestCancellationAnalysis(ctx)})}});

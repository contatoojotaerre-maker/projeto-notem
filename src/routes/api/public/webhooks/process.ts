import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/webhooks/process')({
  server: { handlers: { POST: async ({ request }) => {
    const { verifyScheduler } = await import('@/lib/webhook-scheduler.server')
    if (!await verifyScheduler(request, process.env['GOOGLE_SERVICE_ACCOUNT_JSON'])) {
      return Response.json({ erro: 'AUTENTICACAO_INVALIDA' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }
    const master = process.env['WEBHOOK_ENCRYPTION_KEY']
    if (!master) return Response.json({ erro: 'CONFIGURACAO_INDISPONIVEL' }, { status: 503 })
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { processWebhookBatch } = await import('@/lib/webhooks.server')
    try {
      const result = await processWebhookBatch(supabaseAdmin, master)
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      console.error('WEBHOOK_SCHEDULER_FAILED')
      return Response.json({ erro: 'PROCESSAMENTO_FALHOU' }, { status: 503 })
    }
  } } },
})
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
    const { processWebhookBatch, recordSchedulerRun } = await import('@/lib/webhooks.server')
    try {
      try { const { runDailyRoutine } = await import('@/lib/readiness.server'); await runDailyRoutine(supabaseAdmin) } catch { console.error('DAILY_ROUTINE_FAILED') }
      const { results: _results, ...summary } = await processWebhookBatch(supabaseAdmin, master)
      await recordSchedulerRun(supabaseAdmin, summary, null)
      return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } })
    } catch (e) {
      const code = e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'PROCESSAMENTO_FALHOU'
      console.error('WEBHOOK_SCHEDULER_FAILED', code)
      await recordSchedulerRun(supabaseAdmin, { reserved: 0, completed: 0, failed: 0, disabled: 0 }, code)
      return Response.json({ erro: 'PROCESSAMENTO_FALHOU' }, { status: 503 })
    }
  } } },
})

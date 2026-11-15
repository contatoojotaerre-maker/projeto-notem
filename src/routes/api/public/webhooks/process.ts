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
      const { processInvoiceVerifications,processExternalDps } = await import('@/lib/invoices.server')
      const verification = await processInvoiceVerifications(supabaseAdmin)
      const retries = await processExternalDps(supabaseAdmin)
      const { processFiscalEventVerifications } = await import('@/lib/fiscal-events.server')
      const events = await processFiscalEventVerifications(supabaseAdmin)
      const adn = { reserved: 0, imported: 0, failed: 0, emitted: 0 }
      try {
        const { processAdnSync, reconcileRefusedCancellations, flushNfseEventWebhooks, runDailyEventCheck } = await import('@/lib/adn-sync.server')
        try { await reconcileRefusedCancellations(supabaseAdmin) } catch { console.error('ADN_RECONCILE_FAILED') }
        // Only continues synchronizations requested in the panel; nothing is consulted by NSU without a request.
        try { Object.assign(adn, await processAdnSync(supabaseAdmin, { budgetMs: 15_000 })) } catch { console.error('ADN_SYNC_FAILED') }
        try { await runDailyEventCheck(supabaseAdmin) } catch { console.error('DAILY_EVENT_CHECK_FAILED') }
        adn.emitted = (await flushNfseEventWebhooks(supabaseAdmin)).emitted
      } catch { console.error('ADN_STEP_FAILED') }
      const invoices = {reserved:verification.reserved+retries.reserved+events.reserved+adn.reserved,completed:verification.completed+retries.completed+events.completed,failed:verification.failed+retries.failed+events.failed+adn.failed}
      try { const { runDailyRoutine } = await import('@/lib/readiness.server'); await runDailyRoutine(supabaseAdmin) } catch { console.error('DAILY_ROUTINE_FAILED') }
      try { const { offloadXml } = await import('@/lib/xml-files.server'); await offloadXml(supabaseAdmin, { clear: false, limit: 20 }) } catch { console.error('XML_OFFLOAD_STEP_FAILED') }
      const { results: _results, ...summary } = await processWebhookBatch(supabaseAdmin, master)
      await recordSchedulerRun(supabaseAdmin, {...summary,reserved:summary.reserved+invoices.reserved,completed:summary.completed+invoices.completed,failed:summary.failed+invoices.failed}, null)
      return Response.json({...summary,invoices,adn:{imported:adn.imported,emitted:adn.emitted}}, { headers: { 'Cache-Control': 'no-store' } })
    } catch (e) {
      const code = e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'PROCESSAMENTO_FALHOU'
      console.error('WEBHOOK_SCHEDULER_FAILED', code)
      await recordSchedulerRun(supabaseAdmin, { reserved: 0, completed: 0, failed: 0, disabled: 0 }, code)
      return Response.json({ erro: 'PROCESSAMENTO_FALHOU' }, { status: 503 })
    }
  } } },
})

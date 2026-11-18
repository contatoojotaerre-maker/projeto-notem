import { createFileRoute } from '@tanstack/react-router'

// System health check, every 5 minutes from its own Cloud Scheduler job (OIDC). Separate from the webhook routine.
export const Route = createFileRoute('/api/public/saude/verificar')({
  server: { handlers: { POST: async ({ request }) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
    const { verifyScheduler, healthAudience } = await import('@/lib/webhook-scheduler.server')
    if (!await verifyScheduler(request, process.env['GOOGLE_SERVICE_ACCOUNT_JSON'], healthAudience)) {
      return Response.json({ erro: 'AUTENTICACAO_INVALIDA' }, { status: 401, headers })
    }
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { runHealthCheck } = await import('@/lib/health.server')
    try {
      const r = await runHealthCheck(supabaseAdmin, 'agendada', null)
      return Response.json(r.status === 'ok' ? { situacao: r.overall } : { situacao: r.status }, { headers })
    } catch (e) {
      console.error('HEALTH_CHECK_FAILED', e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'ERRO')
      return Response.json({ erro: 'VERIFICACAO_FALHOU' }, { status: 503, headers })
    }
  } } },
})

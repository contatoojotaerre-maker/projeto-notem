import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/webhooks/process')({
  server: { handlers: { POST: async ({ request }) => {
    const { verifyScheduler } = await import('@/lib/webhook-scheduler.server')
    if (!await verifyScheduler(request, process.env['GOOGLE_SERVICE_ACCOUNT_JSON'])) {
      return Response.json({ erro: 'AUTENTICACAO_INVALIDA' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }
    const id = `req_${crypto.randomUUID().replaceAll('-', '')}`
    const waitUntil = (request as Request & { waitUntil?: (promise: Promise<unknown>) => void }).waitUntil
    if (typeof waitUntil !== 'function') {
      return Response.json({ erro: 'EXECUCAO_EM_SEGUNDO_PLANO_INDISPONIVEL' }, { status: 503 })
    }
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const work = async () => {
      const result = await supabaseAdmin.from('api_request_logs').insert({
        id, method: 'POST', path: '/api/public/webhooks/process', status_code: 200,
        duration_ms: 0, response_body: { diagnostico: 'waitUntil', autenticacao: 'google-oidc' },
      })
      if (result.error) console.error('WEBHOOK_SCHEDULER_PROBE_FAILED', id)
    }
    waitUntil.call(request, work())
    return Response.json({ id, autenticacao: 'google-oidc', execucao: 'waitUntil', diagnostico: true }, {
      headers: { 'Cache-Control': 'no-store', 'Server-Timing': 'webhook;desc="background"' },
    })
  } } },
})
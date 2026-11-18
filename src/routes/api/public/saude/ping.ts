import { createFileRoute } from '@tanstack/react-router'

// External watcher (Google Cloud Monitoring): 200 while the last scheduled health check is recent, 503 otherwise.
// No other detail, no API request log, no cache.
export const Route = createFileRoute('/api/public/saude/ping')({
  server: { handlers: { GET: async () => {
    const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
    const { pingAnswer } = await import('@/lib/health-policy')
    let last: string | null = null
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
      const r = await supabaseAdmin.from('system_heartbeats').select('last_success_at').eq('name', 'health_check').maybeSingle()
      last = r.error ? null : r.data?.last_success_at ?? null
    } catch { last = null }
    const a = pingAnswer(last, Date.now())
    return Response.json(a.body, { status: a.status, headers })
  } } },
})

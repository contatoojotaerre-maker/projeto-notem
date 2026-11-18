// Server-only writer for government-call samples (service-role table, 30-day cleanup by the health check).
import type { GovernmentCallSample } from './government-calls';

export async function recordGovernmentCall(sample: GovernmentCallSample): Promise<void> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.from('government_calls').insert(sample);
  if (r.error) throw new Error('GOV_CALL_RECORD_FAILED');
}

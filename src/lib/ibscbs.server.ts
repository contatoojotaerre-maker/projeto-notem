// Anexo VIII suggestion shared by the panel and the API (RLS: authenticated read of the official catalogs; the API uses the service client).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { buildSuggestion, serviceItemOf, type Correlation, type IbsCbsClassification, type OperationIndicator, type Suggestion } from './ibscbs';

export async function loadIbsCbsSuggestion(db: SupabaseClient<Database>, serviceCode: string): Promise<Suggestion | null> {
  const item = serviceItemOf(serviceCode); if (!item) return null;
  const c = await db.from('ibscbs_service_correlations').select('*').eq('service_item', item).maybeSingle(); if (c.error) throw new Error('CORRELATION_READ_FAILED');
  if (!c.data) return null;
  const corr = c.data as unknown as Correlation;
  const [cls, ind, nbs] = await Promise.all([
    db.from('ibscbs_classifications').select('*').in('code', corr.classifications.map(x => x.code).concat('000000')),
    db.from('ibscbs_operation_indicators').select('code,active,incidence_location').in('code', corr.operation_indicators.map(x => x.code).concat('000000')),
    db.from('nbs_codes').select('code').in('code', corr.nbs.map(x => x.code).concat('000000000')),
  ]);
  if (cls.error || ind.error || nbs.error) throw new Error('CATALOG_READ_FAILED');
  return buildSuggestion(serviceCode, corr, { classifications: new Map((cls.data as IbsCbsClassification[]).map(x => [x.code, x])), indicators: new Map((ind.data as OperationIndicator[]).map(x => [x.code, x])), nbs: new Set(nbs.data.map(x => x.code)) });
}

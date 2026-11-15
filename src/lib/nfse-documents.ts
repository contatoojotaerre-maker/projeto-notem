// Client-safe shapes of official NFS-e received from the ADN: external notes (issued outside notem),
// received notes (company is taker/intermediary) and the manual synchronization status. Shared by API and panel.
import type { Database, Json } from '@/integrations/supabase/types';
import { API_BASE } from './app-url';
import { envLabel, isoBr, type Env } from './api-contract';
import { invoiceStatuses, cancellationOut } from './invoices';
import { publicNfseUrl } from './danfse';

export type NfseDocument = Database['public']['Tables']['nfse_documents']['Row'];
export const EXTERNAL_MUTATION_MESSAGE = 'Nota emitida fora da notem. Cancele ou substitua pelo sistema que a emitiu ou pelo Portal Nacional.';
const obj = (v: unknown): Record<string, Json | undefined> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, Json | undefined> : {};
const series = (v: string | null) => v && /^\d+$/.test(v) ? v.padStart(5, '0') : v;

function base(d: NfseDocument) {
  const s = obj(d.summary), t = obj(s['tomador']), sv = obj(s['servico']), v = obj(s['valores']);
  return {
    id: d.id, ambiente: envLabel(d.environment as Env), situacao: invoiceStatuses[d.status] ?? 'autorizada', restricoes: d.restrictions, manifestacao: d.manifestation,
    numero: d.nfse_number, chave_acesso: d.access_key, serie_dps: series(d.dps_series), numero_dps: d.dps_number, competencia: d.competence,
    emitida_em: isoBr(d.issued_at), autorizada_em: isoBr(d.authorized_at),
    tomador: { documento: d.taker_document, nif: t['nif'] ?? null, nome: d.taker_name, email: t['email'] ?? null },
    servico: { servico_id: null, codigo_servico: sv['codigo_servico'] ?? null, codigo_municipal: sv['codigo_municipal'] ?? null, descricao: sv['descricao'] ?? null },
    valores: { servico: v['valor_servico'] ?? null, base_calculo: v['base_calculo'] ?? null, aliquota_iss: v['aliquota_iss'] ?? null, valor_iss: v['valor_iss'] ?? null, valor_liquido: v['valor_liquido'] ?? null, iss_retido: v['iss_retido'] === true },
    local_prestacao: { codigo_municipio: sv['local_prestacao'] ?? null },
    ibs_cbs: s['ibs_cbs'] ?? null,
    cancelamento: cancellationOut(d.cancellation),
    criada_em: isoBr(d.created_at), atualizada_em: isoBr(d.updated_at),
  };
}
/** Note issued outside notem by a company of the organization (read only). */
export function externalOut(d: NfseDocument, companyId: string) {
  return { ...base(d), origem: 'externa' as const, id_externo: null, empresa_id: companyId, erros_governo: [], substitui_nota_id: null, substituida_por_nota_id: null, operacao_pendente: null,
    links: { xml: `${API_BASE}/notas/${d.id}/xml`, pdf: `${API_BASE}/notas/${d.id}/pdf`, consulta_publica: publicNfseUrl(d.access_key) } };
}
/** Note where the company is taker or intermediary (read only). */
export function receivedOut(d: NfseDocument, companyId: string, cnpj: string) {
  const b = base(d);
  return { ...b, empresa_id: companyId, origem: d.invoice_id ? 'notem' as const : 'externa' as const, papel: d.taker_document === cnpj ? 'tomador' as const : 'intermediario' as const,
    prestador: { cnpj: d.provider_cnpj, nome: d.provider_name }, intermediario: d.intermediary_document ? { documento: d.intermediary_document, nome: d.intermediary_name } : null,
    links: { xml: `${API_BASE}/empresas/${companyId}/notas-recebidas/${d.id}/xml`, pdf: `${API_BASE}/empresas/${companyId}/notas-recebidas/${d.id}/pdf`, consulta_publica: publicNfseUrl(d.access_key) } };
}

export type SyncCursor = { next_nsu: number; status: string; last_query_at: string | null; next_query_at: string; last_error: string | null; last_error_code: string | null; documents_imported: number; first_completed_at: string | null; last_request: Json | null; request?: Json | null };
export type DailyCheck = { last_run_at: string | null; checked: number; updated: number } | null;
const modeOut = (r: Record<string, Json | undefined>) => ({ tipo: r['mode'] === 'news' ? 'novidades' : 'periodo', meses: typeof r['months'] === 'number' ? r['months'] : null });
/** Public synchronization status of one company and environment (no NSU synchronization is offered by the API). */
export function syncStatusOut(env: Env, c: SyncCursor | null, daily: DailyCheck, now = Date.now()) {
  const req = c?.request ? obj(c.request) : null; const last = c?.last_request ? obj(c.last_request) : null;
  const waiting = c && Date.parse(c.next_query_at) > now ? isoBr(c.next_query_at) : null;
  return {
    ambiente: envLabel(env),
    situacao: !c || (!c.first_completed_at && !req && !last) ? 'nunca_sincronizada' : req ? 'em_andamento' : c.status === 'error' ? 'erro' : 'atualizada',
    ultimo_nsu: c && c.next_nsu > 0 ? c.next_nsu - 1 : null,
    ultima_consulta: isoBr(c?.last_query_at), proxima_consulta_permitida: waiting,
    primeira_sincronizacao_concluida_em: isoBr(c?.first_completed_at), documentos_importados: c?.documents_imported ?? 0,
    sincronizacao_em_andamento: req ? { ...modeOut(req), etapa: req['phase'] === 'search' ? 'busca_inicio_periodo' : 'importacao', documentos_importados: Number(req['imported'] ?? 0), solicitada_em: isoBr(String(req['requested_at'] ?? '')) } : null,
    ultima_sincronizacao: last ? { ...modeOut(last), resultado: last['outcome'] === 'completed' ? 'concluida' : 'interrompida', concluida_em: isoBr(String(last['finished_at'] ?? '')), documentos_importados: Number(last['imported'] ?? 0), mensagem: typeof last['message'] === 'string' ? last['message'] : null } : null,
    ultimo_erro: c?.status === 'error' && c.last_error ? { codigo: c.last_error_code, mensagem: c.last_error } : null,
    verificacao_diaria: { ultima_execucao: isoBr(daily?.last_run_at ?? null), notas_verificadas: daily?.checked ?? 0, notas_atualizadas: daily?.updated ?? 0 },
  };
}
export type SyncStatus = ReturnType<typeof syncStatusOut>;

// One source of what needs attention in an organization (Alertas, Início pendências and the menu counter).
// Pure: the server loads the current state and this module decides kind, severity, text and where to fix it.
import type { computeReadiness } from './api-contract';
import { dateBr, dateTimeBr } from './br-format';

export type AlertSeverity = 'impeditivo' | 'atencao' | 'informativo';
export const severityLabels: Record<AlertSeverity, string> = { impeditivo: 'Impeditivo', atencao: 'Atenção', informativo: 'Informativo' };
const ORDER: Record<AlertSeverity, number> = { impeditivo: 0, atencao: 1, informativo: 2 };
export type AlertKind = 'certificado_vencido' | 'certificado_vencendo' | 'empresa_sem_condicao' | 'classificacao_ibscbs' | 'nota_em_verificacao' | 'cancelamento_aguardando' | 'sincronizacao_erro' | 'webhook_falha';
/** Stable ?aba= codes of the company page (see panel-tabs.ts). */
export type CompanyTab = 'certificado' | 'fiscal' | 'servicos' | 'resumo' | 'sincronizacao';
export type AlertLink = { kind: 'company'; company_id: string; tab: CompanyTab } | { kind: 'invoice'; id: string } | { kind: 'integration'; integration_id: string };
export type PanelAlert = { id: string; kind: AlertKind; severity: AlertSeverity; company_id: string | null; company_name: string | null; at: string; message: string; link: AlertLink };

type Readiness = ReturnType<typeof computeReadiness>;
export type AlertInput = {
  now: number;
  companies: { id: string; legal_name: string; active: boolean; readiness: Readiness; certificate: { valid_until: string } | null }[];
  verifying: { id: string; company_id: string; nfse_number: string | null; dps_number: string | number; since: string }[];
  cancellations: { invoice_id: string; company_id: string; nfse_number: string | null; since: string }[];
  syncErrors: { company_id: string; at: string; message: string | null }[];
  webhooks: { id: string; integration_id: string; created_at: string; message: string; url: string | null }[];
};
export const VERIFYING_MINUTES = 30;
export const CANCELLATION_HOURS = 24;
const DAY = 86_400_000;

export function buildAlerts(i: AlertInput): PanelAlert[] {
  const out: PanelAlert[] = []; const name = new Map(i.companies.map(c => [c.id, c.legal_name]));
  const nowIso = new Date(i.now).toISOString();
  for (const c of i.companies.filter(c => c.active)) {
    let certExpired = false;
    if (c.certificate) {
      const until = Date.parse(c.certificate.valid_until); const days = Math.ceil((until - i.now) / DAY);
      if (until <= i.now) { certExpired = true; out.push({ id: `cert:${c.id}`, kind: 'certificado_vencido', severity: 'impeditivo', company_id: c.id, company_name: c.legal_name, at: c.certificate.valid_until, message: `Certificado digital vencido em ${dateBr(c.certificate.valid_until)}. Envie um certificado válido para voltar a emitir.`, link: { kind: 'company', company_id: c.id, tab: 'certificado' } }); }
      else if (days <= 30) out.push({ id: `cert:${c.id}`, kind: 'certificado_vencendo', severity: days <= 7 ? 'atencao' : 'informativo', company_id: c.id, company_name: c.legal_name, at: nowIso, message: `Certificado digital vence em ${days} ${days === 1 ? 'dia' : 'dias'} (${dateBr(c.certificate.valid_until)}).`, link: { kind: 'company', company_id: c.id, tab: 'certificado' } });
    }
    const ibsBlocking = c.readiness.itens.find(x => x.item === 'classificacao_ibscbs' && x.ok !== true);
    const ibsWarning = c.readiness.avisos.find(x => x.item === 'classificacao_ibscbs');
    if (ibsBlocking || ibsWarning) out.push({ id: `ibscbs:${c.id}`, kind: 'classificacao_ibscbs', severity: ibsBlocking ? 'impeditivo' : 'atencao', company_id: c.id, company_name: c.legal_name, at: nowIso, message: (ibsBlocking ?? ibsWarning)!.mensagem, link: { kind: 'company', company_id: c.id, tab: 'servicos' } });
    // Reasons already shown as their own alert (expired certificate, IBS/CBS) are not repeated here.
    const reasons = c.readiness.itens.filter(x => x.ok !== true && x.item !== 'classificacao_ibscbs' && !(certExpired && x.item === 'certificado'));
    if (!c.readiness.pronta_para_emitir && reasons.length) out.push({ id: `ready:${c.id}`, kind: 'empresa_sem_condicao', severity: 'impeditivo', company_id: c.id, company_name: c.legal_name, at: nowIso, message: `A empresa não pode emitir: ${reasons.map(r => r.mensagem.replace(/\.$/, '')).join('; ')}.`, link: { kind: 'company', company_id: c.id, tab: 'resumo' } });
  }
  for (const v of i.verifying) if (i.now - Date.parse(v.since) > VERIFYING_MINUTES * 60_000) out.push({ id: `verif:${v.id}`, kind: 'nota_em_verificacao', severity: 'atencao', company_id: v.company_id, company_name: name.get(v.company_id) ?? null, at: v.since, message: `Nota (DPS ${v.dps_number}) em verificação com o governo desde ${dateTimeBr(v.since)}. A notem continua consultando sem reenviar.`, link: { kind: 'invoice', id: v.id } });
  for (const e of i.cancellations) if (i.now - Date.parse(e.since) > CANCELLATION_HOURS * 3_600_000) out.push({ id: `cancel:${e.invoice_id}`, kind: 'cancelamento_aguardando', severity: 'atencao', company_id: e.company_id, company_name: name.get(e.company_id) ?? null, at: e.since, message: `Cancelamento${e.nfse_number ? ` da NFS-e ${e.nfse_number}` : ''} aguardando confirmação do governo desde ${dateTimeBr(e.since)}.`, link: { kind: 'invoice', id: e.invoice_id } });
  for (const s of i.syncErrors) if (name.has(s.company_id)) out.push({ id: `sync:${s.company_id}`, kind: 'sincronizacao_erro', severity: 'atencao', company_id: s.company_id, company_name: name.get(s.company_id) ?? null, at: s.at, message: `A última sincronização com o ADN terminou com erro${s.message ? `: ${s.message.replace(/\.$/, '')}` : ''}.`, link: { kind: 'company', company_id: s.company_id, tab: 'sincronizacao' } });
  for (const w of i.webhooks) out.push({ id: `webhook:${w.id}`, kind: 'webhook_falha', severity: 'atencao', company_id: null, company_name: null, at: w.created_at, message: `${w.message}${w.url ? ` (${w.url})` : ''}`, link: { kind: 'integration', integration_id: w.integration_id } });
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}

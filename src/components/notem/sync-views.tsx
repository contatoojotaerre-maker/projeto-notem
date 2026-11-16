import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { companySyncQuery, receivedQuery } from '@/lib/invoices.queries';
import { getPanelReceivedXml } from '@/lib/invoices.functions';
import { requestCompanySync, refreshNoteFromGovernment } from '@/lib/adn-sync.functions';
import { invoiceLabels } from '@/lib/invoices';
import { pdfStatuses } from '@/lib/danfse';
import { dateBr, dateTimeBr, moneyBr } from '@/lib/br-format';
import { formatDocument } from '@/lib/note-display';
import { BackToNotes, PdfButton, TakerSection, ValuesSection, saveXml } from './note-sections';
import type { SyncStatus } from '@/lib/nfse-documents';
import type { Env } from '@/lib/api-contract';
import { useWorkspace } from './app-shell';
import { IbsCbsSection } from './ibs-cbs-values';

const when = (v: string | null | undefined) => dateTimeBr(v) || '—';
const money = (v: unknown) => v == null || v === '' ? '—' : moneyBr(v);
const optionLabel = (o: string) => o === 'news' ? 'Novidades desde a última sincronização' : `Últimos ${o.split(':')[1]} ${o === 'period:1' ? 'mês' : 'meses'}`;
const situationLabel: Record<string, string> = { nunca_sincronizada: 'Nunca sincronizada', em_andamento: 'Sincronização em andamento', atualizada: 'Atualizada', erro: 'Interrompida' };

function useNow() { const [now, setNow] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []); return now; }
function countdown(ms: number) { const s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }

/** Empresa → Sincronização: manual, per environment, respecting the ADN interval. */
export function SyncTab({ companyId, organizationId }: { companyId: string; organizationId: string }) {
  const { data } = useSuspenseQuery(companySyncQuery({ company_id: companyId, organization_id: organizationId }));
  return <><h2 className="mb-2 text-lg font-medium">Sincronização com o Ambiente de Dados Nacional</h2>
    <p className="mb-6 max-w-3xl text-sm text-muted-foreground">Importa as notas emitidas fora da notem e as notas recebidas por esta empresa. A sincronização é feita só quando você pede. Depois de uma consulta sem documentos novos, o governo exige 1 hora de intervalo.</p>
    <div className="grid gap-6 lg:grid-cols-2">{data.environments.map(e => <SyncCard key={e.environment} companyId={companyId} organizationId={organizationId} environment={e.environment} status={e.status} nextQueryAt={e.next_query_at} firstCompletedAt={e.first_completed_at} proven={e.proven} canSync={data.canSync} />)}</div></>;
}
function SyncCard(p: { companyId: string; organizationId: string; environment: Env; status: SyncStatus; nextQueryAt: string | null; firstCompletedAt: string | null; proven: boolean; canSync: boolean }) {
  const s = p.status; const now = useNow(); const qc = useQueryClient(); const run = useServerFn(requestCompanySync);
  const options = [...(p.firstCompletedAt ? ['news'] : []), 'period:1', 'period:3', 'period:6', 'period:12', 'period:24'];
  const [option, setOption] = useState(p.firstCompletedAt ? 'news' : 'period:1'); const [busy, setBusy] = useState(false); const [retryAt, setRetryAt] = useState<string | null>(null);
  const until = Math.max(p.nextQueryAt ? Date.parse(p.nextQueryAt) : 0, retryAt ? Date.parse(retryAt) : 0); const waiting = until > now;
  const running = s.situacao === 'em_andamento';
  async function start() {
    setBusy(true);
    try { const r = await run({ data: { company_id: p.companyId, organization_id: p.organizationId, environment: p.environment, option: options.includes(option) ? option : 'period:1' } });
      if (r.ok) toast.success(r.imported ? `${r.imported} documento(s) importado(s). A sincronização continua até terminar.` : 'Sincronização iniciada.');
      else { toast.error(r.mensagem); if ('retryAt' in r && r.retryAt) setRetryAt(r.retryAt); } }
    catch { toast.error('Não foi possível iniciar a sincronização.'); }
    finally { setBusy(false); await qc.invalidateQueries({ queryKey: ['company-sync'] }); }
  }
  const rows: [string, string | number][] = [['Situação', situationLabel[s.situacao] ?? s.situacao], ['Último NSU recebido', s.ultimo_nsu ?? '—'], ['Última consulta', when(s.ultima_consulta)], ['Próxima consulta permitida', s.proxima_consulta_permitida ? when(s.proxima_consulta_permitida) : 'Agora'], ['Documentos importados', s.documentos_importados], ['Primeira sincronização concluída', when(s.primeira_sincronizacao_concluida_em)]];
  return <section className="border-t border-border pt-5">
    <h3 className="mb-4 font-medium">{p.environment === 'production' ? 'Produção' : 'Homologação'}</h3>
    <dl className="grid grid-cols-2 gap-3 text-sm">{rows.map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1">{v}</dd></div>)}</dl>
    {s.sincronizacao_em_andamento && <p className="mt-4 text-sm">{s.sincronizacao_em_andamento.etapa === 'busca_inicio_periodo' ? 'Localizando o início do período…' : 'Importando documentos…'} {s.sincronizacao_em_andamento.documentos_importados} documento(s) até agora.</p>}
    {s.ultima_sincronizacao && <p className="mt-4 text-sm text-muted-foreground">Última sincronização ({s.ultima_sincronizacao.tipo === 'novidades' ? 'novidades' : `${s.ultima_sincronizacao.meses} ${s.ultima_sincronizacao.meses === 1 ? 'mês' : 'meses'}`}): {s.ultima_sincronizacao.resultado === 'concluida' ? 'concluída' : 'interrompida'} em {when(s.ultima_sincronizacao.concluida_em)}, {s.ultima_sincronizacao.documentos_importados} documento(s).</p>}
    {s.ultimo_erro && <p role="alert" className="mt-3 text-sm text-destructive">{s.ultimo_erro.mensagem}</p>}
    <div className="mt-4 text-sm"><p className="text-muted-foreground">Verificação diária das notas com cancelamento pendente</p><p className="mt-1">{s.verificacao_diaria.ultima_execucao ? `${when(s.verificacao_diaria.ultima_execucao)} · ${s.verificacao_diaria.notas_verificadas} nota(s) verificada(s), ${s.verificacao_diaria.notas_atualizadas} atualizada(s)` : 'Ainda não executada.'}</p></div>
    {!p.proven ? <p className="mt-5 text-sm text-muted-foreground">Cadastre o certificado digital desta empresa para sincronizar.</p> : p.canSync ? <div className="mt-5 flex flex-wrap items-center gap-3">
      <Select value={options.includes(option) ? option : 'period:1'} onValueChange={setOption}><SelectTrigger className="w-72" aria-label={`O que sincronizar em ${p.environment === 'production' ? 'produção' : 'homologação'}`}><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o} value={o}>{optionLabel(o)}</SelectItem>)}</SelectContent></Select>
      <Button disabled={busy || waiting || running} onClick={start}><RefreshCw className={busy ? 'animate-spin' : ''} />{busy ? 'Sincronizando…' : running ? 'Em andamento' : waiting ? `Aguarde ${countdown(until - now)}` : 'Sincronizar'}</Button>
    </div> : <p className="mt-5 text-sm text-muted-foreground">Somente proprietário e administrador da organização podem sincronizar.</p>}
  </section>;
}

/** "Atualizar com o governo" (owner, admin, operator, platform admin; once every 5 minutes per note). */
export function RefreshButton({ organizationId, environment, id, companyId }: { organizationId: string; environment: Env; id: string; companyId?: string }) {
  const run = useServerFn(refreshNoteFromGovernment); const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  return <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const r = await run({ data: { organization_id: organizationId, environment, id, ...(companyId ? { company_id: companyId } : {}) } }); if (r.ok) toast.success(r.changed ? 'Nota atualizada com os eventos do governo.' : 'Nenhuma alteração encontrada no governo.'); else toast.error(r.mensagem); await qc.invalidateQueries({ queryKey: ['invoice'] }); await qc.invalidateQueries({ queryKey: ['received'] }); } catch { toast.error('Não foi possível consultar o governo agora.'); } finally { setBusy(false); } }}><RefreshCw className={busy ? 'animate-spin' : ''} />{busy ? 'Consultando…' : 'Atualizar com o governo'}</Button>;
}

type DocOut = { id: string; numero: string | null; chave_acesso: string; serie_dps: string | null; numero_dps: string | null; competencia: string | null; emitida_em: string | null; autorizada_em: string | null; situacao: string; tomador: Record<string, unknown>; servico: Record<string, unknown>; valores: Record<string, unknown>; ibs_cbs?: unknown; cancelamento: { situacao: string | null; justificativa: string | null; registrado_em: string | null } | null };
type OfficialEvent = { id: string; code: string; name: string; sequence: number; processed_at: string | null; reason: string | null; xml: string | null };
const statusKey = (s: string) => Object.entries({ authorized: 'autorizada', cancellation_pending: 'cancelamento_em_analise', cancelled: 'cancelada', substituted: 'substituida', cancelled_by_authority: 'cancelada_prefeitura' }).find(([, v]) => v === s)?.[0] ?? s;
function DocSummary({ n }: { n: DocOut }) {
  return <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
    <section className="border-t border-border pt-5"><h2 className="mb-4 text-lg font-medium">Resumo</h2><dl className="grid grid-cols-2 gap-3 text-sm">{[['Competência', dateBr(n.competencia)], ['Emitida em', dateTimeBr(n.emitida_em)], ['Autorizada em', dateTimeBr(n.autorizada_em)], ['Série DPS', n.serie_dps], ['Número DPS', n.numero_dps]].map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 break-words">{v || '—'}</dd></div>)}</dl><h3 className="mb-2 mt-6 font-medium">Serviço</h3><p className="whitespace-pre-wrap text-sm">{String(n.servico['descricao'] ?? '—')}</p></section>
    <TakerSection taker={n.tomador} />
    <ValuesSection valores={n.valores} />
    <IbsCbsSection value={n.ibs_cbs} />
    {n.cancelamento && <section className="border-t border-border pt-5"><h2 className="mb-4 text-lg font-medium">Cancelamento</h2><dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">Justificativa</dt><dd className="mt-1">{n.cancelamento.justificativa ?? '—'}</dd></div><div><dt className="text-muted-foreground">Registrado em</dt><dd className="mt-1">{when(n.cancelamento.registrado_em)}</dd></div></dl></section>}
  </div>;
}
export function OfficialEvents({ events, name }: { events: OfficialEvent[]; name: string }) {
  if (!events.length) return null;
  return <section className="mt-8 border-t border-border pt-5"><h2 className="mb-4 text-lg font-medium">Eventos registrados no governo</h2><ol className="space-y-4">{events.map(e => <li key={e.id} className="border-l-2 border-border pl-4"><p className="text-sm font-medium">{e.name}</p><p className="mt-1 text-xs text-muted-foreground">{when(e.processed_at)}{e.reason ? ` · ${e.reason}` : ''}</p>{e.xml && <Button variant="ghost" size="sm" className="mt-2" onClick={() => saveXml(e.xml ?? '', `evento-${e.code}-${e.sequence}-${name}.xml`)}><Download />XML do evento</Button>}</li>)}</ol></section>;
}

/** Detail of a note issued outside notem: read only (cancel and substitute through the issuing system or the Portal Nacional). */
export function ExternalDetail({ organizationId, slug, environment, id, data }: { organizationId: string; slug: string; environment: Env; id: string; data: { nota: DocOut; status: string; xml: string | null; officialEvents: OfficialEvent[]; canRefresh: boolean } }) {
  const n = data.nota;
  return <><BackToNotes slug={slug} />
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><h1 className="page-heading">NFS-e {n.numero ?? ''}</h1><p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span className="status-badge" data-status="inactive">Emitida fora da notem</span>{invoiceLabels[data.status] ?? data.status} · {environment === 'sandbox' ? 'Homologação' : 'Produção'}</p></div>
      <div className="flex flex-wrap gap-3">{data.canRefresh && <RefreshButton organizationId={organizationId} environment={environment} id={id} />}{pdfStatuses.includes(data.status) && <PdfButton organizationId={organizationId} environment={environment} id={id} />}{data.xml && <Button onClick={() => saveXml(data.xml ?? '', `nfse-${n.numero ?? id}.xml`)}><Download />Baixar XML</Button>}</div></div>
    <p className="mb-8 max-w-3xl text-sm text-muted-foreground">Esta nota foi emitida por outro sistema ou pelo Portal Nacional e chegou pela sincronização com o governo. Para cancelar ou substituir, use o sistema que a emitiu ou o Portal Nacional.</p>
    <DocSummary n={n} /><OfficialEvents events={data.officialEvents} name={n.numero ?? id} />
    <details className="mt-8 border-y border-border py-5"><summary className="cursor-pointer font-medium">Detalhes técnicos</summary><dl className="mt-5 space-y-3 text-sm"><dt>Chave de acesso</dt><dd className="break-all font-mono">{n.chave_acesso}</dd></dl>{data.xml && <pre className="mt-5 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-muted p-4 text-xs">{data.xml}</pre>}</details></>;
}

/** Empresa → Notas recebidas: notes where the company is taker or intermediary; read only. */
export function ReceivedTab({ companyId, organizationId }: { companyId: string; organizationId: string }) {
  const w = useWorkspace(); const environment = w.profile?.environment ?? 'production'; const [status, setStatus] = useState('all'); const [offset, setOffset] = useState(0);
  return <><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-medium">Notas recebidas</h2><p className="mt-1 text-sm text-muted-foreground">Notas em que esta empresa é tomadora ou intermediária, trazidas pela sincronização · {environment === 'sandbox' ? 'Homologação' : 'Produção'}</p></div>
    <Select value={status} onValueChange={v => { setStatus(v); setOffset(0); }}><SelectTrigger className="w-60" aria-label="Situação da nota recebida"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem>{['authorized', 'cancellation_pending', 'cancelled', 'substituted', 'cancelled_by_authority'].map(s => <SelectItem key={s} value={s}>{invoiceLabels[s]}</SelectItem>)}</SelectContent></Select></div>
    <ReceivedRows companyId={companyId} organizationId={organizationId} environment={environment} status={status} offset={offset} onPage={setOffset} /></>;
}
function ReceivedRows(p: { companyId: string; organizationId: string; environment: Env; status: string; offset: number; onPage: (n: number) => void }) {
  const { data } = useSuspenseQuery(receivedQuery({ company_id: p.companyId, organization_id: p.organizationId, environment: p.environment, offset: p.offset, ...(p.status === 'all' ? {} : { status: p.status }) }));
  const getXml = useServerFn(getPanelReceivedXml); const w = useWorkspace(); const canRefresh = (() => { const role = w.memberships.find(m => m.organization_id === p.organizationId)?.role; return w.isAdmin === true || ['owner', 'admin', 'operator'].includes(String(role)); })();
  if (!data.rows.length) return <div className="flex items-center gap-3 border-y border-border py-8 text-muted-foreground"><Inbox className="size-5" />Nenhuma nota recebida. Sincronize a empresa para trazer as notas do governo.</div>;
  return <><div className="divide-y divide-border">{data.rows.map(n => <details key={n.id} className="py-5"><summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1"><span className="font-medium">NFS-e {n.numero ?? '—'}</span><span className="text-sm">{n.prestador.nome ?? formatDocument(n.prestador.cnpj)}</span><span className="status-badge" data-status={n.situacao === 'autorizada' ? 'active' : 'inactive'}>{invoiceLabels[statusKey(n.situacao)] ?? n.situacao}</span><span className="text-sm text-muted-foreground">{money(n.valores['servico'])} · {dateBr(n.emitida_em) || '—'}</span>{n.papel === 'intermediario' && <span className="text-xs text-muted-foreground">como intermediária</span>}{n.origem === 'notem' && <span className="text-xs text-muted-foreground">emitida pela notem</span>}</summary>
    <div className="mt-5"><p className="mb-4 text-sm">Prestador: {n.prestador.nome ?? '—'} · CNPJ {formatDocument(n.prestador.cnpj)}</p><DocSummary n={n as unknown as DocOut} />
      <div className="mt-5 flex flex-wrap gap-3">{canRefresh && <RefreshButton organizationId={p.organizationId} environment={p.environment} id={n.id} companyId={p.companyId} />}{pdfStatuses.includes(statusKey(n.situacao)) && <PdfButton organizationId={p.organizationId} environment={p.environment} id={n.id} companyId={p.companyId} />}<Button variant="outline" onClick={async () => { try { const r = await getXml({ data: { organization_id: p.organizationId, environment: p.environment, company_id: p.companyId, id: n.id } }); saveXml(r.xml, r.filename); } catch { toast.error('Não foi possível baixar o XML.'); } }}><Download />Baixar XML</Button></div></div></details>)}</div>
    <div className="mt-5 flex justify-end gap-2"><Button variant="outline" size="icon" aria-label="Notas recebidas anteriores" disabled={!p.offset} onClick={() => p.onPage(Math.max(0, p.offset - 50))}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Próximas notas recebidas" disabled={!data.more} onClick={() => p.onPage(p.offset + 50)}><ChevronRight /></Button></div></>;
}

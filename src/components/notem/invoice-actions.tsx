import { useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Ban, FileSearch, Replace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { requestPanelFiscalEvent, substitutePanelInvoice } from '@/lib/invoices.functions';
import { FISCAL_TEXT_MESSAGE, fiscalTextAccepted, normalizeFiscalText } from '@/lib/fiscal-text';
import type { Env } from '@/lib/api-contract';
import { normalizeCnpj } from '@/lib/notem';

export const cancelReasonLabels: Record<string, string> = { erro_emissao: 'Erro na emissão', servico_nao_prestado: 'Serviço não prestado', outros: 'Outros' };
export const substitutionReasonLabels: Record<string, string> = { desenquadramento_simples: 'Desenquadramento do Simples Nacional', enquadramento_simples: 'Enquadramento no Simples Nacional', inclusao_imunidade_isencao: 'Inclusão retroativa de imunidade ou isenção', exclusao_imunidade_isencao: 'Exclusão retroativa de imunidade ou isenção', rejeicao_tomador_intermediario: 'Rejeição pelo tomador ou intermediário', outros: 'Outros' };
export const cancellationStatusLabels: Record<string, string> = { em_verificacao: 'Aguardando confirmação do governo', cancelado: 'Cancelamento registrado', em_analise: 'Em análise pela prefeitura', recusado: 'Recusado pelo governo', nao_registrado: 'Não registrado pelo governo', nao_enviado: 'Não enviado' };
type Result = { ok: true; status: string; invoice_id: string } | { ok: false; mensagem: string; detalhes: { campo: string; mensagem: string }[] };
type Substitution = { service_profile_id: string | null; competence: string; description: string; complementary: string | null; service: string; unconditional: string; conditional: string; withholding: number; location: string; customer: unknown };
type Props = { organizationId: string; slug: string; environment: Env; id: string; status: string; canManage: boolean; pending: boolean; canRequestAnalysis: boolean; simples: number | null; profiles: { id: string; name: string }[]; substitution: Substitution };

function Justification({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const normalized = normalizeFiscalText(value); const length = [...normalized].length; const refused = !fiscalTextAccepted(normalized);
  return <div className="space-y-2"><label htmlFor="justification" className="text-sm font-medium">Justificativa</label><Textarea id="justification" rows={3} value={value} onChange={e => onChange(e.target.value)} aria-describedby="justification-help" /><p id="justification-help" className={`text-xs ${refused || (value && (length < 15 || length > 255)) ? 'text-destructive' : 'text-muted-foreground'}`}>{refused ? `A justificativa ${FISCAL_TEXT_MESSAGE} (por exemplo, emojis).` : `${length} de 15 a 255 caracteres. Travessões, aspas curvas e espaços extras são ajustados automaticamente.`}</p></div>;
}
const justificationOk = (v: string) => { const n = normalizeFiscalText(v); const l = [...n].length; return fiscalTextAccepted(n) && l >= 15 && l <= 255; };
function Problems({ result }: { result: Result | null }) { if (!result || result.ok) return null; return <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"><p className="font-medium">{result.mensagem}</p>{result.detalhes.map((d, i) => <p key={i} className="mt-1">{d.campo !== 'nota' && d.campo !== 'corpo' ? `${d.campo}: ` : ''}{d.mensagem}</p>)}</div>; }
function FiscalConfirm({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) { return <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"><Checkbox checked={checked} onCheckedChange={v => onChange(v === true)} className="mt-0.5" /><span><strong>Esta ação tem efeito fiscal.</strong> O pedido será enviado ao governo e não pode ser desfeito pela notem.</span></label>; }

export function InvoiceActions(p: Props) {
  const qc = useQueryClient(); const navigate = useNavigate();
  const sendEvent = useServerFn(requestPanelFiscalEvent); const substitute = useServerFn(substitutePanelInvoice);
  const [open, setOpen] = useState<null | 'cancel' | 'analysis' | 'substitute'>(null);
  const [key, setKey] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState<Result | null>(null);
  const [reason, setReason] = useState(''); const [justification, setJustification] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const start = (kind: 'cancel' | 'analysis' | 'substitute') => { setOpen(kind); setKey(crypto.randomUUID()); setResult(null); setReason(''); setJustification(''); setConfirmed(false); };
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['invoice'] }), qc.invalidateQueries({ queryKey: ['invoices'] })]);
  async function submitEvent() {
    if (open !== 'cancel' && open !== 'analysis') return; setBusy(true); setResult(null);
    try { const r = await sendEvent({ data: { organization_id: p.organizationId, environment: p.environment, id: p.id, idempotency_key: key, kind: open, body: { motivo: reason, justificativa: justification } } }); setResult(r); if (r.ok) { await refresh(); setOpen(null); toast.success(r.status === 'pending' ? 'Pedido enviado; aguardando confirmação do governo.' : open === 'cancel' ? 'Cancelamento registrado.' : 'Pedido de análise registrado.'); } else await refresh(); }
    catch { setResult({ ok: false, mensagem: 'Não foi possível enviar agora. Tente novamente; o pedido não será duplicado.', detalhes: [] }); } finally { setBusy(false); }
  }
  if (!p.canManage || p.status !== 'authorized') return null;
  return <>
    {p.pending ? null : <div className="mb-6 flex flex-wrap gap-3"><Button variant="outline" onClick={() => start('cancel')}><Ban />Cancelar nota</Button><Button variant="outline" onClick={() => start('substitute')}><Replace />Substituir nota</Button>{p.canRequestAnalysis && <Button variant="outline" onClick={() => start('analysis')}><FileSearch />Solicitar análise da prefeitura</Button>}</div>}
    <Dialog open={open === 'cancel' || open === 'analysis'} onOpenChange={v => { if (!v && !busy) setOpen(null); }}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{open === 'analysis' ? 'Solicitar análise fiscal do cancelamento' : 'Cancelar nota'}</DialogTitle><DialogDescription>{open === 'analysis' ? 'A prefeitura decide se a nota pode ser cancelada. Até a decisão, a nota fica em análise.' : 'O cancelamento é registrado no Sistema Nacional da NFS-e.'}</DialogDescription></DialogHeader>
        <div className="space-y-5"><div className="space-y-2"><label className="text-sm font-medium">Motivo</label><Select value={reason} onValueChange={setReason}><SelectTrigger aria-label="Motivo"><SelectValue placeholder="Escolha o motivo" /></SelectTrigger><SelectContent>{Object.entries(cancelReasonLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div><Justification value={justification} onChange={setJustification} /><FiscalConfirm checked={confirmed} onChange={setConfirmed} /><Problems result={result} /></div>
        <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setOpen(null)}>Voltar</Button><Button variant="destructive" disabled={busy || !reason || !confirmed || !justificationOk(justification)} onClick={submitEvent}>{busy ? 'Enviando…' : open === 'analysis' ? 'Solicitar análise' : 'Cancelar nota'}</Button></DialogFooter></DialogContent>
    </Dialog>
    {open === 'substitute' && <SubstituteDialog {...p} idempotencyKey={key} busy={busy} onClose={() => { if (!busy) setOpen(null); }} onSubmit={async body => { setBusy(true); setResult(null); try { const r = await substitute({ data: { organization_id: p.organizationId, environment: p.environment, id: p.id, idempotency_key: key, body } }); setResult(r); await refresh(); if (r.ok) { setOpen(null); toast.success(r.status === 'pending' ? 'Nota substituta enviada; aguardando confirmação do governo.' : 'Nota substituta autorizada.'); if (r.invoice_id !== p.id) await navigate({ to: '/o/$orgSlug/notas/$invoiceId', params: { orgSlug: p.slug, invoiceId: r.invoice_id } }); } } catch { setResult({ ok: false, mensagem: 'Não foi possível enviar agora. Tente novamente; a nota não será duplicada.', detalhes: [] }); } finally { setBusy(false); } }} result={result} />}
  </>;
}

function SubstituteDialog(p: Props & { idempotencyKey: string; busy: boolean; result: Result | null; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const s = p.substitution; const customer = s.customer && typeof s.customer === 'object' ? s.customer as Record<string, unknown> : null;
  const [f, setF] = useState({ reason: '', justification: '', profile: s.service_profile_id ?? '', competence: s.competence, description: s.description, service: s.service, unconditional: s.unconditional, conditional: s.conditional, withholding: s.withholding === 2 ? 'retido_tomador' : s.withholding === 3 ? 'retido_intermediario' : 'nao_retido', location: s.location, complementary: s.complementary ?? '', name: String(customer?.['nome'] ?? ''), email: String(customer?.['email'] ?? ''), document: String(customer?.['documento'] ?? '') });
  const [confirmed, setConfirmed] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const lock = useMemo(() => ({ fixed: p.simples === 1, simples: p.simples === 2 || p.simples === 3 }), [p.simples]);
  const decimal = /^\d{1,15}\.\d{2}$/; const valid = f.reason && justificationOk(f.justification) && f.profile && f.description.trim() && decimal.test(f.service) && decimal.test(f.unconditional) && decimal.test(f.conditional) && /^\d{7}$/.test(f.location) && confirmed;
  function body() {
    const out: Record<string, unknown> = { motivo: f.reason, justificativa: f.justification, servico_id: f.profile, competencia: f.competence, descricao: f.description, valores: { servico: f.service, ...Number(f.unconditional) > 0 ? { desconto_incondicionado: f.unconditional } : {}, ...Number(f.conditional) > 0 ? { desconto_condicionado: f.conditional } : {} }, retencao_iss: f.withholding, local_prestacao: { codigo_municipio: f.location }, informacoes_complementares: f.complementary.trim() ? f.complementary : null };
    if (customer) out['tomador'] = { ...customer, nome: f.name, email: f.email.trim() ? f.email.trim() : null, ...customer['tipo'] === 'estrangeiro' ? {} : { documento: normalizeCnpj(f.document) } };
    return out;
  }
  const field = (id: string, label: string, el: React.ReactNode, hint?: string) => <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}</label>{el}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
  const locked = (why: string) => `Bloqueado: ${why}`;
  return <Dialog open onOpenChange={v => { if (!v) p.onClose(); }}>
    <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl"><DialogHeader><DialogTitle>Substituir nota</DialogTitle><DialogDescription>Uma nova nota é emitida com os dados abaixo. A nota atual só passa a substituída quando a nova for autorizada.</DialogDescription></DialogHeader>
      <div className="-mx-6 flex-1 space-y-6 overflow-y-auto px-6">
        <div className="grid gap-5 sm:grid-cols-2">{field('sub-reason', 'Motivo da substituição', <Select value={f.reason} onValueChange={set('reason')}><SelectTrigger id="sub-reason" aria-label="Motivo da substituição"><SelectValue placeholder="Escolha o motivo" /></SelectTrigger><SelectContent>{Object.entries(substitutionReasonLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>)}
          {field('sub-profile', 'Serviço', <Select value={f.profile} onValueChange={set('profile')} disabled={lock.fixed}><SelectTrigger id="sub-profile" aria-label="Serviço"><SelectValue placeholder="Escolha o serviço" /></SelectTrigger><SelectContent>{p.profiles.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select>, lock.fixed ? locked('não optante não pode alterar o serviço (E0060).') : undefined)}</div>
        <Justification value={f.justification} onChange={set('justification')} />
        {field('sub-description', 'Descrição do serviço', <Textarea id="sub-description" rows={4} value={f.description} onChange={e => set('description')(e.target.value)} />, 'Quebras de linha são mantidas; demais caracteres especiais são ajustados automaticamente.')}
        <div className="grid gap-5 sm:grid-cols-2">
          {field('sub-competence', 'Competência', <Input id="sub-competence" type="date" value={f.competence} disabled readOnly />, locked('a competência não pode mudar na substituição (E0060/E0061).'))}
          {field('sub-location', 'Município da prestação (código IBGE)', <Input id="sub-location" inputMode="numeric" maxLength={7} value={f.location} disabled={lock.fixed} onChange={e => set('location')(e.target.value.replace(/\D/g, ''))} />, lock.fixed ? locked('não optante não pode alterar o local (E0060).') : undefined)}
          {field('sub-service', 'Valor do serviço (ex.: 150.00)', <Input id="sub-service" inputMode="decimal" value={f.service} disabled={lock.simples} onChange={e => set('service')(e.target.value)} />, lock.simples ? locked('MEI e ME/EPP não podem alterar o valor (E0061).') : undefined)}
          {field('sub-withholding', 'Retenção do ISS', <Select value={f.withholding} onValueChange={set('withholding')}><SelectTrigger id="sub-withholding" aria-label="Retenção do ISS"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao_retido">Não retido</SelectItem><SelectItem value="retido_tomador">Retido pelo tomador</SelectItem><SelectItem value="retido_intermediario">Retido pelo intermediário</SelectItem></SelectContent></Select>)}
          {field('sub-unconditional', 'Desconto incondicionado', <Input id="sub-unconditional" inputMode="decimal" value={f.unconditional} onChange={e => set('unconditional')(e.target.value)} />)}
          {field('sub-conditional', 'Desconto condicionado', <Input id="sub-conditional" inputMode="decimal" value={f.conditional} onChange={e => set('conditional')(e.target.value)} />)}
        </div>
        {customer ? <div className="grid gap-5 sm:grid-cols-2"><p className="text-sm font-medium sm:col-span-2">Tomador</p>
          {field('sub-name', 'Nome', <Input id="sub-name" value={f.name} onChange={e => set('name')(e.target.value)} />)}
          {customer['tipo'] !== 'estrangeiro' && field('sub-document', customer['tipo'] === 'pf' ? 'CPF' : 'CNPJ', <Input id="sub-document" inputMode={customer['tipo'] === 'pf' ? 'numeric' : 'text'} autoCapitalize="characters" value={f.document} disabled={lock.simples} onChange={e => set('document')(e.target.value)} />, lock.simples ? locked('MEI e ME/EPP não podem alterar o documento do tomador (E0061).') : undefined)}
          {field('sub-email', 'E-mail', <Input id="sub-email" type="email" value={f.email} onChange={e => set('email')(e.target.value)} />)}
          <p className="text-xs text-muted-foreground sm:col-span-2">O endereço do tomador é mantido. Para trocar o tomador por completo, use a API.</p></div> : <p className="text-sm text-muted-foreground">A nota original não tem tomador; a substituta também não terá.</p>}
        {field('sub-complementary', 'Informações complementares', <Textarea id="sub-complementary" rows={2} value={f.complementary} onChange={e => set('complementary')(e.target.value)} />)}
        <FiscalConfirm checked={confirmed} onChange={setConfirmed} />
        <Problems result={p.result} />
      </div>
      <DialogFooter className="border-t border-border pt-4"><Button variant="ghost" disabled={p.busy} onClick={p.onClose}>Voltar</Button><Button disabled={p.busy || !valid} onClick={() => p.onSubmit(body())}>{p.busy ? 'Enviando…' : 'Emitir nota substituta'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function PendingNotice({ pending }: { pending: { tipo: string; desde: string | null } | null }) {
  if (!pending) return null;
  return <div role="status" className="mb-6 flex items-start gap-3 rounded-md border border-border bg-muted p-4 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><p className="font-medium">{pending.tipo === 'cancelamento' ? 'Cancelamento aguardando confirmação do governo' : 'Análise fiscal aguardando confirmação do governo'}</p><p className="mt-1 text-muted-foreground">A notem consulta o governo automaticamente; não repita o pedido. A nota segue autorizada até a confirmação.</p></div></div>;
}

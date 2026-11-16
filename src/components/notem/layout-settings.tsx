import { dateTimeBr } from '@/lib/br-format';
import { useState } from 'react';
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getLayoutStatus, updateNt009Start, updateFiscalPlatformSetting } from '@/lib/platform-settings.functions';

export const layoutStatusQuery = () => queryOptions({ queryKey: ['layout-status'], queryFn: () => getLayoutStatus(), staleTime: 15_000 });
const show = (iso: string) => dateTimeBr(iso);
/** datetime-local value in Brasília time (UTC-3, no daylight saving since 2019). */
const toLocal = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 16);

const day = (d: string) => d.split('-').reverse().join('/');
type Status = Extract<Awaited<ReturnType<typeof getLayoutStatus>>, { ok: true }>['status'];
type Setting = 'ibscbs_required_sandbox_from' | 'ibscbs_required_production_from' | 'nt009r2_sandbox_starts_at' | 'nt009r2_production_starts_at';
const SETTINGS: { key: Setting; label: string; date: boolean; confirm: (v: string) => string }[] = [
  { key: 'ibscbs_required_sandbox_from', label: 'IBS/CBS obrigatório em homologação a partir de', date: true, confirm: v => `Notas de homologação com competência a partir de ${day(v)} levarão o grupo IBS/CBS e exigirão a classificação dos serviços.` },
  { key: 'ibscbs_required_production_from', label: 'IBS/CBS obrigatório em produção a partir de', date: true, confirm: v => `Notas de produção com competência a partir de ${day(v)} levarão o grupo IBS/CBS e exigirão a classificação dos serviços. Empresas sem classificação deixam de estar prontas para emitir nessa data.` },
  { key: 'nt009r2_sandbox_starts_at', label: 'Próximo leiaute (NT 009 r2) em homologação a partir de', date: false, confirm: v => v ? `DPS de homologação enviadas a partir de ${show(`${v}:00-03:00`)} usarão o próximo leiaute (regime de apuração do IBS/CBS e atividade do Simples).` : 'O próximo leiaute ficará desligado em homologação.' },
  { key: 'nt009r2_production_starts_at', label: 'Próximo leiaute (NT 009 r2) em produção a partir de', date: false, confirm: v => v ? `DPS de produção enviadas a partir de ${show(`${v}:00-03:00`)} usarão o próximo leiaute (regime de apuração do IBS/CBS e atividade do Simples).` : 'O próximo leiaute ficará desligado em produção.' },
];
function FiscalDateSettings({ status }: { status: Status }) {
  const cache = useQueryClient(); const save = useServerFn(updateFiscalPlatformSetting);
  const initial = (k: Setting) => k === 'ibscbs_required_sandbox_from' ? status.dates.ibsCbsRequiredFrom.sandbox : k === 'ibscbs_required_production_from' ? status.dates.ibsCbsRequiredFrom.production : (k === 'nt009r2_sandbox_starts_at' ? status.dates.nt009r2Start.sandbox : status.dates.nt009r2Start.production) ? toLocal((k === 'nt009r2_sandbox_starts_at' ? status.dates.nt009r2Start.sandbox : status.dates.nt009r2Start.production)!) : '';
  const [values, setValues] = useState<Record<Setting, string>>(() => Object.fromEntries(SETTINGS.map(x => [x.key, initial(x.key)])) as Record<Setting, string>);
  const [pending, setPending] = useState<Setting | null>(null); const [busy, setBusy] = useState(false);
  const item = SETTINGS.find(x => x.key === pending);
  async function apply() {
    if (!item) return; setBusy(true);
    try { const v = values[item.key]; const r = await save({ data: { setting: item.key, value: item.date || !v ? v : `${v}:00-03:00` } }); if (!r.ok) { toast.error(r.mensagem); return; } await cache.invalidateQueries({ queryKey: ['layout-status'] }); toast.success('Configuração fiscal da plataforma atualizada.'); }
    catch { toast.error('Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); setPending(null); }
  }
  return <section className="mt-10 max-w-xl space-y-6" aria-labelledby="ibscbs-dates">
    <div className="space-y-2"><h2 id="ibscbs-dates" className="text-lg font-medium">IBS/CBS e próximo leiaute</h2><p className="text-sm text-muted-foreground">Antes da data de obrigatoriedade, a nota sai sem o grupo IBS/CBS e a falta de classificação é só um aviso. Padrão: {day(status.defaultIbsCbsFrom)}. O próximo leiaute fica desligado até receber uma data.</p></div>
    {SETTINGS.map(x => <div key={x.key} className="form-field"><label htmlFor={x.key}>{x.label}{x.date ? '' : ' (horário de Brasília; vazio = desligado)'}</label><div className="flex gap-3"><Input id={x.key} type={x.date ? 'date' : 'datetime-local'} value={values[x.key]} onChange={e => setValues({ ...values, [x.key]: e.target.value })} /><Button variant="outline" disabled={busy || values[x.key] === initial(x.key) || (x.date && !values[x.key])} onClick={() => setPending(x.key)}><Save />Salvar</Button></div></div>)}
    <AlertDialog open={pending !== null} onOpenChange={o => { if (!o) setPending(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar alteração?</AlertDialogTitle>
      <AlertDialogDescription>{item ? item.confirm(values[item.key]) : ''} A alteração fica registrada na trilha de auditoria.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void apply(); }}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
export function LayoutSettings() {
  const { data } = useSuspenseQuery(layoutStatusQuery());
  const cache = useQueryClient(); const save = useServerFn(updateNt009Start);
  const initial = data.ok ? toLocal(data.status.productionStart) : '';
  const [value, setValue] = useState(initial); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  if (!data.ok) return <p className="text-sm text-muted-foreground">{data.mensagem}</p>;
  const s = data.status;
  async function apply() {
    setBusy(true);
    try { const r = await save({ data: { value: `${value}:00-03:00` } }); if (!r.ok) { toast.error(r.mensagem); return; } await cache.invalidateQueries({ queryKey: ['layout-status'] }); toast.success('Início do leiaute NT 009 em produção atualizado.'); }
    catch { toast.error('Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); setConfirm(false); }
  }
  return <>
    <p className="mb-2 text-xs text-muted-foreground">Administração</p><h1 className="page-heading mb-8">Leiaute fiscal</h1>
    <div className="table-wrap max-w-3xl"><table className="data-table"><thead><tr><th>Ambiente</th><th>Leiaute vigente agora</th><th>Regra</th></tr></thead><tbody>
      <tr><td className="font-medium">Homologação</td><td>{s.current.sandbox.label}</td><td className="text-muted-foreground">Sempre NT 009 (produção restrita valida o novo leiaute desde 20/10/2026).</td></tr>
      <tr><td className="font-medium">Produção</td><td>{s.current.production.label}</td><td className="text-muted-foreground">NT 009 a partir de {show(s.productionStart)} (horário de Brasília).</td></tr>
    </tbody></table></div>
    <div className="table-wrap mt-6 max-w-3xl"><table className="data-table"><thead><tr><th>Ambiente</th><th>IBS/CBS obrigatório a partir de</th><th>Próximo leiaute (NT 009 r2)</th></tr></thead><tbody>
      <tr><td className="font-medium">Homologação</td><td>{day(s.dates.ibsCbsRequiredFrom.sandbox)}</td><td>{s.dates.nt009r2Start.sandbox ? show(s.dates.nt009r2Start.sandbox) : 'Desligado'}</td></tr>
      <tr><td className="font-medium">Produção</td><td>{day(s.dates.ibsCbsRequiredFrom.production)}</td><td>{s.dates.nt009r2Start.production ? show(s.dates.nt009r2Start.production) : 'Desligado'}</td></tr>
    </tbody></table></div>
    <section className="mt-10 max-w-xl space-y-4" aria-labelledby="layout-start">
      <h2 id="layout-start" className="text-lg font-medium">Início do leiaute NT 009 em produção</h2>
      <p className="text-sm text-muted-foreground">O leiaute é decidido imediatamente antes de cada envio ao governo. Altere esta data apenas se o governo adiar a entrada em produção. Padrão: {show(s.defaultStart)}.</p>
      <div className="form-field"><label htmlFor="nt009-start">Data e hora (horário de Brasília)</label><Input id="nt009-start" type="datetime-local" value={value} onChange={e => setValue(e.target.value)} /></div>
      {s.updatedAt && <p className="text-xs text-muted-foreground">Última alteração em {show(s.updatedAt)}.</p>}
      <Button disabled={busy || !value || value === initial} onClick={() => setConfirm(true)}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Salvar</Button>
    </section>
    <FiscalDateSettings status={s} />
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Alterar o início do leiaute NT 009?</AlertDialogTitle>
      <AlertDialogDescription>Notas de produção enviadas a partir de {value ? dateTimeBr(`${value}:00-03:00`) : '-'} usarão o leiaute NT 009. A alteração fica registrada na trilha de auditoria.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void apply(); }}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

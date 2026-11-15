import { useState } from 'react';
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getLayoutStatus, updateNt009Start } from '@/lib/platform-settings.functions';

export const layoutStatusQuery = () => queryOptions({ queryKey: ['layout-status'], queryFn: () => getLayoutStatus(), staleTime: 15_000 });
const BRT = 'America/Sao_Paulo';
const show = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: BRT, dateStyle: 'short', timeStyle: 'short' });
/** datetime-local value in Brasília time (UTC-3, no daylight saving since 2019). */
const toLocal = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 16);

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
    <section className="mt-10 max-w-xl space-y-4" aria-labelledby="layout-start">
      <h2 id="layout-start" className="text-lg font-medium">Início do leiaute NT 009 em produção</h2>
      <p className="text-sm text-muted-foreground">O leiaute é decidido imediatamente antes de cada envio ao governo. Altere esta data apenas se o governo adiar a entrada em produção. Padrão: {show(s.defaultStart)}.</p>
      <div className="form-field"><label htmlFor="nt009-start">Data e hora (horário de Brasília)</label><Input id="nt009-start" type="datetime-local" value={value} onChange={e => setValue(e.target.value)} /></div>
      {s.updatedAt && <p className="text-xs text-muted-foreground">Última alteração em {show(s.updatedAt)}.</p>}
      <Button disabled={busy || !value || value === initial} onClick={() => setConfirm(true)}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Salvar</Button>
    </section>
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Alterar o início do leiaute NT 009?</AlertDialogTitle>
      <AlertDialogDescription>Notas de produção enviadas a partir de {value ? new Date(`${value}:00-03:00`).toLocaleString('pt-BR', { timeZone: BRT, dateStyle: 'short', timeStyle: 'short' }) : '-'} usarão o leiaute NT 009. A alteração fica registrada na trilha de auditoria.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void apply(); }}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

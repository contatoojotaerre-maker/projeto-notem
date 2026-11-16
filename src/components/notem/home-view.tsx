import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboardQuery } from '@/lib/panel-home.queries';
import { PERIODS, periodLabels, moneyBr, dateBr, dateTimeBr, type Period } from '@/lib/br-format';
import { invoiceLabels } from '@/lib/invoices';
import { useWorkspace } from './app-shell';
import { AlertRows, AllClear } from './alerts-view';

const Metric = ({ label, value, note }: { label: string; value: string | number; note?: string }) => <div className="metric"><p className="metric-label">{label}</p><p className="metric-value">{value}</p>{note && <p className="metric-note">{note}</p>}</div>;
const statusTone = (s: string) => s === 'authorized' ? 'active' : s === 'rejected' ? 'error' : ['processing', 'verifying', 'cancellation_pending'].includes(s) ? 'warning' : 'inactive';

export function HomeView({ organizationId, slug, name, canCreate }: { organizationId: string; slug: string; name: string; canCreate: boolean }) {
  const w = useWorkspace(); const environment = w.profile?.environment ?? 'production'; const [period, setPeriod] = useState<Period>('mes_atual');
  const { data } = useSuspenseQuery(dashboardQuery({ organization_id: organizationId, environment, period }));
  if (!data.companies.total) return <><h1 className="page-heading">{name}</h1><div className="empty-state"><Building2 size={36} strokeWidth={1} className="text-muted-foreground" /><h2 className="text-lg font-medium">Nenhuma empresa cadastrada</h2><p className="text-sm text-muted-foreground">Cadastre a primeira empresa para começar a emitir e acompanhar notas.</p>{canCreate && <Button asChild><Link to="/o/$orgSlug/empresas/nova" params={{ orgSlug: slug }}><Plus />Cadastrar empresa</Link></Button>}</div></>;
  const n = data.notes; const total = (k: 'emitted' | 'cancelled' | 'rejected') => Number(n.notem[k]) + Number(n.externa[k]);
  const sum = (() => { const c = (v: string) => BigInt(v.replace('.', '')); const t = (c(n.notem.amount) + c(n.externa.amount)).toString().padStart(3, '0'); return `${t.slice(0, -2)}.${t.slice(-2)}`; })();
  return <><h1 className="page-heading">{name}</h1><p className="mt-2 text-sm text-muted-foreground">{environment === 'sandbox' ? 'Homologação' : 'Produção'}</p>
    <section className="mt-8"><h2 className="mb-3 text-lg font-medium">Empresas</h2><div className="metric-grid"><Metric label="Total" value={data.companies.total} /><Metric label="Ativas" value={data.companies.active} /><Metric label="Inativas" value={data.companies.inactive} /><Metric label="Prontas para emitir" value={data.companies.ready} /><Metric label="Com pendência" value={data.companies.pending} note="Empresas ativas" /></div></section>
    <section className="mt-10"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Notas do período</h2><div className="flex gap-1" role="group" aria-label="Período">{PERIODS.map(p => <Button key={p} size="sm" variant={period === p ? 'secondary' : 'ghost'} aria-pressed={period === p} onClick={() => setPeriod(p)}>{periodLabels[p]}</Button>)}</div></div>
      <div className="metric-grid"><Metric label="Notas emitidas" value={total('emitted')} note={`${n.notem.emitted} pela notem · ${n.externa.emitted} fora da notem`} /><Metric label="Valor total emitido" value={moneyBr(sum)} note={`${moneyBr(n.notem.amount)} pela notem · ${moneyBr(n.externa.amount)} fora da notem`} /><Metric label="Canceladas" value={total('cancelled')} /><Metric label="Rejeitadas pelo governo" value={n.notem.rejected} note="Somente notas da notem" /></div>
      <p className="mt-3 text-xs text-muted-foreground">De {dateBr(data.period.first)} a {dateBr(data.period.last)}. Notas emitidas no período, pela data de emissão (horário de Brasília). O valor soma as notas autorizadas, sem as canceladas e as substituídas.</p></section>
    <section className="mt-10"><h2 className="mb-3 text-lg font-medium">Pendências</h2>{data.alerts.length ? <><AlertRows alerts={data.alerts} slug={slug} /><Link to="/o/$orgSlug/$section" params={{ orgSlug: slug, section: 'alertas' }} className="mt-4 inline-block text-sm underline underline-offset-4">Ver todos os alertas ({data.alertCount})</Link></> : <AllClear />}</section>
    <section className="mt-10"><h2 className="mb-3 text-lg font-medium">Últimas notas</h2>{data.latest.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Número</th><th>Empresa</th><th>Tomador</th><th>Valor</th><th>Situação</th><th>Origem</th><th>Data</th></tr></thead><tbody>{data.latest.map(i => <tr key={i.id}><td><Link to="/o/$orgSlug/notas/$invoiceId" params={{ orgSlug: slug, invoiceId: i.id }} className="font-medium underline underline-offset-4">{i.number ?? 'Aguardando número'}</Link></td><td>{i.company_name ?? 'Empresa'}</td><td>{i.customer.nome ? String(i.customer.nome) : '—'}</td><td className="whitespace-nowrap">{moneyBr(i.value)}</td><td><span className="status-badge" data-status={statusTone(i.status)}>{invoiceLabels[i.status] ?? i.status}</span></td><td>{i.origin === 'notem' ? 'notem' : 'Fora da notem'}</td><td className="whitespace-nowrap">{dateTimeBr(i.emitted_at)}</td></tr>)}</tbody></table></div> : <p className="border-y border-border py-6 text-muted-foreground">Nenhuma nota neste ambiente.</p>}</section></>;
}

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { orgAlertsQuery } from '@/lib/panel-home.queries';
import { webhookAlertsQuery } from '@/lib/webhooks.queries';
import { severityLabels, type AlertSeverity, type PanelAlert } from '@/lib/alerts';
import { dateTimeBr } from '@/lib/br-format';
import { companyTabLabels } from '@/lib/panel-tabs';
import { useWorkspace } from './app-shell';

const badge: Record<AlertSeverity, string> = { impeditivo: 'error', atencao: 'warning', informativo: 'inactive' };
export function SeverityBadge({ severity }: { severity: AlertSeverity }) { return <span className="status-badge" data-status={badge[severity]}>{severityLabels[severity]}</span>; }
const linkLabel = (a: PanelAlert) => a.link.kind === 'invoice' ? 'Abrir nota' : a.link.kind === 'integration' ? 'Abrir integração' : `Abrir ${companyTabLabels[a.link.tab]}`;
export function AlertAction({ alert, slug }: { alert: PanelAlert; slug: string }) {
  const l = alert.link; const label = linkLabel(alert);
  if (l.kind === 'invoice') return <Link className="inline-flex items-center gap-1 text-sm underline underline-offset-4" to="/o/$orgSlug/notas/$invoiceId" params={{ orgSlug: slug, invoiceId: l.id }}>{label}<ArrowUpRight size={14} /></Link>;
  if (l.kind === 'integration') return <Link className="inline-flex items-center gap-1 text-sm underline underline-offset-4" to="/o/$orgSlug/integracoes/$integrationId" params={{ orgSlug: slug, integrationId: l.integration_id }}>{label}<ArrowUpRight size={14} /></Link>;
  return <Link className="inline-flex items-center gap-1 text-sm underline underline-offset-4" to="/o/$orgSlug/empresas/$companyId" params={{ orgSlug: slug, companyId: l.company_id }} search={{ aba: l.tab }}>{label}<ArrowUpRight size={14} /></Link>;
}
export function AlertRows({ alerts, slug }: { alerts: PanelAlert[]; slug: string }) {
  return <ul className="divide-y divide-border border-y border-border">{alerts.map(a => <li key={a.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><SeverityBadge severity={a.severity} />{a.company_name && <span className="text-sm font-medium">{a.company_name}</span>}<span className="text-xs text-muted-foreground">{dateTimeBr(a.at)}</span></div><p className="mt-2 text-sm">{a.message}</p></div>
    <AlertAction alert={a} slug={slug} /></li>)}</ul>;
}
export function AllClear({ text = 'Tudo em dia' }: { text?: string }) { return <div className="flex items-center gap-3 border-y border-border py-6 text-muted-foreground"><CheckCircle2 className="size-5 text-[var(--success)]" />{text}</div>; }

export function AlertsView({ organizationId, slug }: { organizationId: string; slug: string }) {
  const w = useWorkspace(); const environment = w.profile?.environment ?? 'production';
  const { data } = useSuspenseQuery(orgAlertsQuery({ organization_id: organizationId, environment }));
  const [severity, setSeverity] = useState('all'), [company, setCompany] = useState('all');
  const list = data.alerts.filter(a => (severity === 'all' || a.severity === severity) && (company === 'all' || a.company_id === company));
  return <><h1 className="page-heading">Alertas</h1><p className="mb-7 mt-2 text-sm text-muted-foreground">O que precisa de atenção em {environment === 'sandbox' ? 'homologação' : 'produção'}. Os alertas somem sozinhos quando o problema é resolvido.</p>
    <div className="mb-6 grid max-w-2xl gap-4 sm:grid-cols-2"><div className="space-y-2"><label className="text-sm">Gravidade</label><Select value={severity} onValueChange={setSeverity}><SelectTrigger aria-label="Filtrar gravidade"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as gravidades</SelectItem>{(Object.keys(severityLabels) as AlertSeverity[]).map(s => <SelectItem key={s} value={s}>{severityLabels[s]}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><label className="text-sm">Empresa</label><Select value={company} onValueChange={setCompany}><SelectTrigger aria-label="Filtrar empresa dos alertas"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as empresas</SelectItem>{data.companies.map(c => <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>)}</SelectContent></Select></div></div>
    {list.length ? <AlertRows alerts={list} slug={slug} /> : <AllClear text={data.alerts.length ? 'Nenhum alerta com estes filtros.' : 'Tudo em dia'} />}
    <WebhookHistory organizationId={organizationId} /></>;
}
function WebhookHistory({ organizationId }: { organizationId: string }) {
  const { data } = useSuspenseQuery(webhookAlertsQuery(organizationId));
  if (!data.length) return null;
  return <details className="mt-10 border-y border-border py-5"><summary className="cursor-pointer font-medium">Histórico de falhas de webhook (90 dias)</summary><div className="mt-4 divide-y divide-border">{data.map(a => <section key={a.id} className="py-4"><p className="text-sm">{a.message}</p><p className="mt-1 break-all text-sm text-muted-foreground">{a.webhook_endpoints?.url}</p><p className="mt-1 text-xs text-muted-foreground">{a.environment === 'sandbox' ? 'Homologação' : 'Produção'} · {dateTimeBr(a.created_at)}</p></section>)}</div></details>;
}

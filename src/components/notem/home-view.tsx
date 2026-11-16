import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, CheckCircle2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { dashboardQuery } from '@/lib/panel-home.queries';
import { PERIODS, periodLabels, dateBr, type Period } from '@/lib/br-format';
import { alertsLine, externalLine, variation, type Trend } from '@/lib/home-metrics';
import { useWorkspace } from './app-shell';

/** Big number, short label; optional small lines. Purely presentational (the link wraps it). */
function Tile({ label, value, note, trend, trendLabel }: { label: string; value: number; note?: string; trend?: Trend; trendLabel?: string }) {
  return <><p className="metric-label">{label}</p><p className="metric-value">{value}</p>
    {note && <p className="metric-note">{note}</p>}
    {trend && <p className="metric-trend" data-tone={trend.tone}>{trend.text} {trendLabel}</p>}</>;
}
const Section = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => <section className="mt-10 first-of-type:mt-8"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">{title}</h2>{aside}</div>{children}</section>;

export function HomeView({ organizationId, slug, name, canCreate }: { organizationId: string; slug: string; name: string; canCreate: boolean }) {
  const w = useWorkspace(); const environment = w.profile?.environment ?? 'production'; const [period, setPeriod] = useState<Period>('mes_atual');
  const { data } = useSuspenseQuery(dashboardQuery({ organization_id: organizationId, environment, period }));
  if (!data.companies.total) return <><h1 className="page-heading">{name}</h1><div className="empty-state"><Building2 size={36} strokeWidth={1} className="text-muted-foreground" /><h2 className="text-lg font-medium">Nenhuma empresa cadastrada</h2><p className="text-sm text-muted-foreground">Cadastre a primeira empresa para começar a emitir e acompanhar notas.</p>{canCreate && <Button asChild><Link to="/o/$orgSlug/empresas/nova" params={{ orgSlug: slug }}><Plus />Cadastrar empresa</Link></Button>}</div></>;
  const c = data.companies, n = data.notes.current, p = data.notes.previous.notem, cmp = data.period.label, i = data.integration;
  const compared = `Comparado com ${dateBr(data.period.previous.first)} a ${dateBr(data.period.previous.last)}.`;
  const company = (label: string, value: number, situacao?: string) => <Link className="metric metric-link" to="/o/$orgSlug/empresas" params={{ orgSlug: slug }} search={situacao ? { situacao } : {}}><Tile label={label} value={value} /></Link>;
  // Shortcuts open Requisições already filtered: last 24 hours, current environment (and only errors for the error tile).
  const logs = (body: ReactNode, onlyErrors = false, cls = 'metric metric-link') => i?.single ? <Link className={cls} to="/o/$orgSlug/integracoes/$integrationId" params={{ orgSlug: slug, integrationId: i.single }} search={{ aba: 'chamadas', ultimas: '24h', ambiente: environment, ...(onlyErrors ? { erros: 1 as const } : {}) }}>{body}</Link> : <Link className={cls} to="/o/$orgSlug/integracoes" params={{ orgSlug: slug }}>{body}</Link>;
  const errors = i ? i.client_errors + i.server_errors : 0;
  const a = data.alerts; const alertTotal = a.impeditivo + a.atencao + a.informativo;
  return <TooltipProvider delayDuration={150}><h1 className="page-heading">{name}</h1><p className="mt-2 text-sm text-muted-foreground">{environment === 'sandbox' ? 'Homologação' : 'Produção'}</p>
    <Section title="Empresas"><div className="metric-grid">{company('Total', c.total)}{company('Prontas para emitir', c.ready, 'prontas')}{company('Com pendência', c.pending, 'pendencia')}{company('Inativas', c.inactive, 'inativas')}</div></Section>

    <Section title="Notas" aside={<div className="flex flex-wrap gap-1" role="group" aria-label="Período">{PERIODS.map(x => <Button key={x} size="sm" variant={period === x ? 'secondary' : 'ghost'} aria-pressed={period === x} onClick={() => setPeriod(x)}>{periodLabels[x]}</Button>)}</div>}>
      <div className="metric-grid" title={compared}>
        <div className="metric"><Tile label="Emitidas" value={n.notem.emitted} note={externalLine('emitida', n.externa.emitted)} trend={variation(n.notem.emitted, p.emitted, 'good')} trendLabel={cmp} /></div>
        <div className="metric"><Tile label="Canceladas" value={n.notem.cancelled} note={externalLine('cancelada', n.externa.cancelled)} trend={variation(n.notem.cancelled, p.cancelled, 'bad')} trendLabel={cmp} /></div>
        <div className="metric"><Tile label="Rejeitadas pelo governo" value={n.notem.rejected} trend={variation(n.notem.rejected, p.rejected, 'bad')} trendLabel={cmp} /></div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">De {dateBr(data.period.current.first)} a {dateBr(data.period.current.last)}, pela data de emissão (horário de Brasília). O número grande conta as notas emitidas pela notem. {compared}</p></Section>

    {i && <Section title="Integração (últimas 24 horas)">{!i.integrations
      ? <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-6 text-muted-foreground">Nenhuma integração criada{/* the block is shown only to roles that can create integrations */}<Link to="/o/$orgSlug/integracoes" params={{ orgSlug: slug }} className="inline-flex items-center gap-1 text-sm text-foreground underline underline-offset-4">Ir para Integrações<ArrowUpRight size={14} /></Link></div>
      : <div className="metric-grid">
        {logs(<Tile label="Chamadas à API" value={i.calls} />)}
        <Tooltip><TooltipTrigger asChild>{logs(<><Tile label="Chamadas com erro" value={errors} /><span className="sr-only">Erros do pedido (4xx): {i.client_errors}. Erros da notem (5xx): {i.server_errors}.</span></>, true)}</TooltipTrigger>
          <TooltipContent><p>Erros do pedido (4xx): {i.client_errors}</p><p>Erros da notem (5xx): {i.server_errors}</p></TooltipContent></Tooltip>
        {i.webhook_integration ? <Link className="metric metric-link" to="/o/$orgSlug/integracoes/$integrationId" params={{ orgSlug: slug, integrationId: i.webhook_integration }} search={{ aba: 'webhooks', ambiente: environment }}><Tile label="Webhooks falhando" value={i.webhooks_failing} /></Link> : <Link className="metric metric-link" to="/o/$orgSlug/integracoes" params={{ orgSlug: slug }}><Tile label="Webhooks falhando" value={i.webhooks_failing} /></Link>}
      </div>}</Section>}

    <Section title="Alertas"><Link to="/o/$orgSlug/$section" params={{ orgSlug: slug, section: 'alertas' }} className="metric-row">
      {alertTotal ? <span>{alertsLine(a)}</span> : <span className="inline-flex items-center gap-3 text-muted-foreground"><CheckCircle2 className="size-5 text-[var(--success)]" />Tudo em dia</span>}
      <span className="inline-flex items-center gap-1 text-sm underline underline-offset-4">Ver alertas<ArrowUpRight size={14} /></span></Link></Section>
  </TooltipProvider>;
}

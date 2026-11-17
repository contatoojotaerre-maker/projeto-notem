import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bell, Building2, CheckCircle2, Clock, Code2, FileText, Layers, Plug, Plus, Send, ShieldX, TriangleAlert, X, XCircle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { callsByHourQuery, dashboardQuery } from '@/lib/panel-home.queries';
import { PERIODS, periodLabels, dateBr, type Period } from '@/lib/br-format';
import { alertsLine, busiestHourLine, externalLine, hourBr, notesDonut, sharePercents, variation, type Trend } from '@/lib/home-metrics';
import { useWorkspace } from './app-shell';

type Tone = 'lime' | 'cyan';
/** Big number, short label; optional small lines. Purely presentational (the link wraps it). */
function Tile({ icon: Icon, label, value, note, trend, trendLabel }: { icon: LucideIcon; label: string; value: number; note?: string; trend?: Trend; trendLabel?: string }) {
  return <><Icon size={22} strokeWidth={1.75} className="metric-icon" aria-hidden="true" /><p className="metric-label">{label}</p><p className="metric-value">{value}</p>
    {note && <p className="metric-note">{note}</p>}
    {trend && <p className="metric-trend" data-tone={trend.tone}>{trend.text} {trendLabel}</p>}</>;
}
const Section = ({ title, icon: Icon, sub, aside, children }: { title: string; icon: LucideIcon; sub?: string; aside?: ReactNode; children: ReactNode }) =>
  <section className="mt-10 first-of-type:mt-8"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="section-title"><span className="section-icon"><Icon size={19} strokeWidth={1.75} aria-hidden="true" /></span><span>{title}{sub && <small> {sub}</small>}</span></h2>{aside}</div>{children}</section>;

/** Chart colours: lime, cyan and the status colours of the theme (never hard-coded). */
const DONUT_COLORS = { vigentes: 'var(--primary)', canceladas: 'var(--cyan)', rejeitadas: 'var(--destructive)' } as const;

function NotesDonut({ emitted, cancelled, rejected }: { emitted: number; cancelled: number; rejected: number }) {
  const d = notesDonut({ emitted, cancelled, rejected }); const r = 52, len = 2 * Math.PI * r; let offset = 0;
  return <div className="chart-card flex flex-wrap items-center justify-center gap-5">
    <div className="relative size-32 shrink-0"><svg viewBox="0 0 140 140" className="size-full -rotate-90" aria-hidden="true" focusable="false">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--secondary)" strokeWidth="16" />
      {d.total > 0 && d.slices.map(s => { const part = s.value / d.total * len; const el = s.value ? <circle key={s.key} className="donut-ring" cx="70" cy="70" r={r} fill="none" stroke={DONUT_COLORS[s.key]} strokeWidth="16" strokeDasharray={`${part} ${len - part}`} strokeDashoffset={-offset} /> : null; offset += part; return el; })}
    </svg><div className="absolute inset-0 grid place-content-center text-center"><span className="text-2xl font-bold tabular-nums">{d.total}</span><span className="text-xs text-muted-foreground">{d.total === 1 ? 'nota' : 'notas'}</span></div></div>
    <div className="min-w-[190px] flex-1">{d.total === 0 && <p className="mb-2 text-sm text-muted-foreground">Nenhuma nota no período</p>}
      <ul className="space-y-2.5 text-sm">{d.slices.map(s => <li key={s.key} className="flex items-center gap-3"><span className="chart-dot" style={{ background: DONUT_COLORS[s.key] }} aria-hidden="true" /><span className="min-w-0 flex-1">{s.label}</span><span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">{s.value} · {s.pct}%</span></li>)}</ul></div>
  </div>;
}

/** "Situação agora": today's company numbers as one bar (no history is stored, so there is no timeline). */
function CompaniesNow({ slug, ready, pending, inactive }: { slug: string; ready: number; pending: number; inactive: number }) {
  const rows = [{ key: 'prontas', label: 'Prontas para emitir', value: ready, color: 'var(--primary)' }, { key: 'pendencia', label: 'Com pendência', value: pending, color: 'var(--warning)' }, { key: 'inativas', label: 'Inativas', value: inactive, color: 'var(--neutral)' }] as const;
  const pct = sharePercents(rows.map(r => r.value));
  return <div className="chart-card"><p className="chart-title">Situação agora</p>
    <div className="share-bar mt-4" aria-hidden="true">{rows.map((r, i) => pct[i] ? <span key={r.key} style={{ width: `${pct[i]}%`, background: r.color }} /> : null)}</div>
    <ul className="mt-4 space-y-2 text-sm">{rows.map((r, i) => <li key={r.key}><Link to="/o/$orgSlug/empresas" params={{ orgSlug: slug }} search={{ situacao: r.key }} className="flex items-center gap-3 rounded-md px-1 py-0.5 hover:bg-accent"><span className="chart-dot" style={{ background: r.color }} aria-hidden="true" /><span className="min-w-0 flex-1">{r.label}</span><span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">{r.value} · {pct[i]}%</span></Link></li>)}</ul>
  </div>;
}

/** "Chamadas à API (24h)": one bar per hour, loaded after the Início (its own query, 60 s cache). */
function CallsByHour({ organizationId, environment }: { organizationId: string; environment: 'sandbox' | 'production' }) {
  const q = useQuery(callsByHourQuery({ organization_id: organizationId, environment }));
  if (q.data === null) return null;
  const buckets = q.data?.buckets; const max = Math.max(1, ...(buckets ?? []).map(b => b.calls));
  return <div className="chart-card flex flex-col"><p className="chart-title">Chamadas à API (24h)</p>
    {q.isError ? <p className="mt-4 text-sm text-muted-foreground">Não foi possível carregar o gráfico.</p> : <>
      <svg viewBox="0 0 240 80" className="mt-4 h-20 w-full" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs><linearGradient id="calls-bar" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" style={{ stopColor: 'var(--cyan)' }} /><stop offset="100%" style={{ stopColor: 'var(--primary)' }} /></linearGradient></defs>
        {Array.from({ length: 24 }, (_, i) => { const b = buckets?.[i]; const h = b ? (b.calls ? Math.max(4, b.calls / max * 76) : 2) : 2; return <rect key={i} x={i * 10 + 2.5} y={80 - h} width="5" height={h} rx="2" fill={b?.calls ? 'url(#calls-bar)' : 'var(--secondary)'}>{b && <title>{`${hourBr(b.from)}–${hourBr(b.to)}: ${b.calls} ${b.calls === 1 ? 'chamada' : 'chamadas'}${b.errors ? `, ${b.errors} com erro` : ''}`}</title>}</rect>; })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>24 h atrás</span><span>agora</span></div>
      <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">{buckets ? busiestHourLine(buckets) : 'Carregando…'}</p></>}
  </div>;
}

export function HomeView({ organizationId, slug, name, canCreate }: { organizationId: string; slug: string; name: string; canCreate: boolean }) {
  const w = useWorkspace(); const environment = w.profile?.environment ?? 'production'; const [period, setPeriod] = useState<Period>('mes_atual');
  const { data } = useSuspenseQuery(dashboardQuery({ organization_id: organizationId, environment, period }));
  if (!data.companies.total) return <><h1 className="page-heading">{name}</h1><div className="empty-state"><Building2 size={36} strokeWidth={1} className="text-muted-foreground" /><h2 className="text-lg font-medium">Nenhuma empresa cadastrada</h2><p className="text-sm text-muted-foreground">Cadastre a primeira empresa para começar a emitir e acompanhar notas.</p>{canCreate && <Button asChild><Link to="/o/$orgSlug/empresas/nova" params={{ orgSlug: slug }}><Plus />Cadastrar empresa</Link></Button>}</div></>;
  const c = data.companies, n = data.notes.current, p = data.notes.previous.notem, cmp = data.period.label, i = data.integration;
  const compared = `Comparado com ${dateBr(data.period.previous.first)} a ${dateBr(data.period.previous.last)}.`;
  const company = (icon: LucideIcon, label: string, value: number, situacao?: 'prontas' | 'pendencia' | 'inativas', tone?: Tone) => <Link className="metric metric-link" data-tone={tone} to="/o/$orgSlug/empresas" params={{ orgSlug: slug }} search={situacao ? { situacao } : {}}><Tile icon={icon} label={label} value={value} /></Link>;
  // Shortcuts open Chamadas already filtered: last 24 hours (and only errors for the error tile); the environment is the selector's.
  const logs = (body: ReactNode, onlyErrors = false, tone?: Tone) => i?.single ? <Link className="metric metric-link" data-tone={tone} to="/o/$orgSlug/integracoes/$integrationId" params={{ orgSlug: slug, integrationId: i.single }} search={{ aba: 'chamadas', ultimas: '24h', ...(onlyErrors ? { erros: 1 as const } : {}) }}>{body}</Link> : <Link className="metric metric-link" data-tone={tone} to="/o/$orgSlug/integracoes" params={{ orgSlug: slug }}>{body}</Link>;
  const errors = i ? i.client_errors + i.server_errors : 0;
  const a = data.alerts; const alertTotal = a.impeditivo + a.atencao + a.informativo;
  return <TooltipProvider delayDuration={150}><h1 className="page-heading">{name}</h1><p className="mt-1 pl-5 text-sm text-muted-foreground">{environment === 'sandbox' ? 'Homologação' : 'Produção'}</p>
    <Section title="Empresas" icon={Building2}><div className="home-split"><div className="metric-grid">{company(Building2, 'Total', c.total, undefined, 'lime')}{company(Send, 'Prontas para emitir', c.ready, 'prontas')}{company(Clock, 'Com pendência', c.pending, 'pendencia')}{company(XCircle, 'Inativas', c.inactive, 'inativas')}</div>
      <CompaniesNow slug={slug} ready={c.ready} pending={c.pending} inactive={c.inactive} /></div></Section>

    <Section title="Notas" icon={FileText} aside={<div className="segmented" role="group" aria-label="Período">{PERIODS.map(x => <Button key={x} size="sm" variant="ghost" aria-pressed={period === x} onClick={() => setPeriod(x)}>{periodLabels[x]}</Button>)}</div>}>
      <div className="home-split"><div className="metric-grid" title={compared}>
        <div className="metric" data-tone="lime"><Tile icon={Send} label="Emitidas" value={n.notem.emitted} note={externalLine('emitida', n.externa.emitted)} trend={variation(n.notem.emitted, p.emitted, 'good')} trendLabel={cmp} /></div>
        <div className="metric"><Tile icon={X} label="Canceladas" value={n.notem.cancelled} note={externalLine('cancelada', n.externa.cancelled)} trend={variation(n.notem.cancelled, p.cancelled, 'bad')} trendLabel={cmp} /></div>
        <div className="metric"><Tile icon={ShieldX} label="Rejeitadas pelo governo" value={n.notem.rejected} trend={variation(n.notem.rejected, p.rejected, 'bad')} trendLabel={cmp} /></div>
      </div><NotesDonut emitted={n.notem.emitted} cancelled={n.notem.cancelled} rejected={n.notem.rejected} /></div>
      <p className="mt-3 text-xs text-muted-foreground">De {dateBr(data.period.current.first)} a {dateBr(data.period.current.last)}, pela data de emissão (horário de Brasília). O número grande conta as notas emitidas pela notem. {compared}</p></Section>

    {i && <Section title="Integração" sub="(últimas 24 horas)" icon={Code2}>{!i.integrations
      ? <div className="metric-row text-muted-foreground">Nenhuma integração criada{/* the block is shown only to roles that can create integrations */}<Link to="/o/$orgSlug/integracoes" params={{ orgSlug: slug }} className="inline-flex items-center gap-1 text-sm text-foreground underline underline-offset-4">Ir para Integrações<ArrowUpRight size={14} /></Link></div>
      : <div className="home-split"><div className="metric-grid">
        {logs(<Tile icon={Plug} label="Chamadas à API" value={i.calls} />, false, 'cyan')}
        <Tooltip><TooltipTrigger asChild>{logs(<><Tile icon={TriangleAlert} label="Chamadas com erro" value={errors} /><span className="sr-only">Erros do pedido (4xx): {i.client_errors}. Erros da notem (5xx): {i.server_errors}.</span></>, true)}</TooltipTrigger>
          <TooltipContent><p>Erros do pedido (4xx): {i.client_errors}</p><p>Erros da notem (5xx): {i.server_errors}</p></TooltipContent></Tooltip>
        {i.webhook_integration ? <Link className="metric metric-link" to="/o/$orgSlug/integracoes/$integrationId" params={{ orgSlug: slug, integrationId: i.webhook_integration }} search={{ aba: 'webhooks' }}><Tile icon={Layers} label="Webhooks falhando" value={i.webhooks_failing} /></Link> : <Link className="metric metric-link" to="/o/$orgSlug/integracoes" params={{ orgSlug: slug }}><Tile icon={Layers} label="Webhooks falhando" value={i.webhooks_failing} /></Link>}
      </div><CallsByHour organizationId={organizationId} environment={environment} /></div>}</Section>}

    <Section title="Alertas" icon={Bell}><Link to="/o/$orgSlug/$section" params={{ orgSlug: slug, section: 'alertas' }} className="metric-row">
      {alertTotal ? <span>{alertsLine(a)}</span> : <span className="inline-flex items-center gap-3 text-muted-foreground"><CheckCircle2 className="size-5 text-success" />Tudo em dia</span>}
      <span className="inline-flex items-center gap-1 text-sm underline underline-offset-4">Ver alertas<ArrowUpRight size={14} /></span></Link></Section>
  </TooltipProvider>;
}

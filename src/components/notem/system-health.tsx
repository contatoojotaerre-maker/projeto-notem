import { useState } from 'react';
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Activity, AlertTriangle, BellRing, CheckCircle2, Loader2, Mail, RefreshCw, Save, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { brDateTime, HEALTH_LIMITS, type Block, type HealthState } from '@/lib/health-policy';
import { getSystemHealth, runHealthNow, saveHealthAlertSettings, sendHealthTestEmail, type HealthView } from '@/lib/health.functions';

export const systemHealthQuery = () => queryOptions({ queryKey: ['system-health'], queryFn: () => getSystemHealth(), staleTime: 30_000, refetchInterval: 60_000 });

const BADGE: Record<HealthState, { status: string; label: string }> = {
  ok: { status: 'active', label: 'Funcionando' }, atencao: { status: 'warning', label: 'Atenção' }, problema: { status: 'error', label: 'Problema' }, neutro: { status: 'inactive', label: 'Sem dados recentes' },
};
const OVERALL = { ok: { label: 'Tudo funcionando', Icon: CheckCircle2, cls: 'text-success' }, atencao: { label: 'Atenção', Icon: AlertTriangle, cls: 'text-warning' }, problema: { label: 'Problema', Icon: XCircle, cls: 'text-destructive' } } as const;
const Badge = ({ state }: { state: HealthState }) => <span className="status-badge" data-status={BADGE[state].status}>{BADGE[state].label}</span>;

export function SystemHealth() {
  const { data } = useSuspenseQuery(systemHealthQuery());
  if (!data.ok) return <><h1 className="page-heading mb-8">Saúde do sistema</h1><p role="alert" className="text-destructive">{data.mensagem}</p></>;
  return <SystemHealthView view={data} />;
}

export function SystemHealthView({ view, preview = false }: { view: Extract<HealthView, { ok: true }>; preview?: boolean }) {
  const cache = useQueryClient(); const run = useServerFn(runHealthNow); const [busy, setBusy] = useState(false);
  const r = view.latest?.result;
  const verify = async () => { if (preview) return; setBusy(true); try { const x = await run(); if (!x.ok) toast.error(x.mensagem); else { toast.success('Verificação concluída.'); await cache.invalidateQueries({ queryKey: ['system-health'] }); } } finally { setBusy(false); } };
  const o = r ? OVERALL[r.overall] : null;
  return <>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-heading">Saúde do sistema</h1><p className="mt-2 text-sm text-muted-foreground">Todas as organizações. Verificação automática a cada 5 minutos; horários de Brasília.</p></div>
      <Button onClick={verify} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}Verificar agora</Button></div>

    <section className="glass-panel mt-8 p-6" aria-labelledby="health-summary">
      {!r || !o ? <p id="health-summary" className="text-muted-foreground">Nenhuma verificação registrada ainda. Use "Verificar agora" ou aguarde a tarefa agendada.</p> : <>
        <div className="flex flex-wrap items-center gap-3"><o.Icon className={`size-8 ${o.cls}`} aria-hidden /><h2 id="health-summary" className="text-2xl font-bold">{o.label}</h2>
          <span className="text-sm text-muted-foreground">Última verificação: {brDateTime(view.latest?.at)} ({view.latest?.trigger === 'manual' ? 'manual' : 'automática'})</span></div>
        {r.attention.length > 0 && <ul className="mt-4 space-y-2">{r.attention.map(a => <li key={a.block} className="flex flex-wrap items-center gap-2 text-sm"><Badge state={a.state} /><a className="font-semibold underline-offset-4 hover:underline" href={`#bloco-${a.block}`}>{a.title}</a><span className="text-muted-foreground">{a.text}</span></li>)}</ul>}
      </>}
    </section>

    {r && <div className="mt-6 grid gap-4 lg:grid-cols-2">{r.blocks.map(b => <HealthBlock key={b.id} block={b} />)}</div>}
    <AlertSettings view={view} preview={preview} />
  </>;
}

function HealthBlock({ block: b }: { block: Block }) {
  return <section id={`bloco-${b.id}`} className="chart-card scroll-mt-24" aria-labelledby={`t-${b.id}`}>
    <div className="flex items-start justify-between gap-3"><h3 id={`t-${b.id}`} className="font-bold [font-feature-settings:'calt'_0]">{b.title}</h3><Badge state={b.state} /></div>
    {b.lines.length > 0 && <dl className="mt-3 grid gap-1.5 text-sm">{b.lines.map(l => <div key={l.label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">{l.label}</dt><dd className="text-right font-medium">{l.value}</dd></div>)}</dl>}
    {b.items.length > 0 && <ul className="mt-3 space-y-1.5 text-sm">{b.items.slice(0, 12).map((i, n) => <li key={n} className="flex items-start gap-2"><span className="chart-dot mt-1.5 shrink-0" data-state={i.state} aria-hidden /><span className="sr-only">{BADGE[i.state].label}: </span>{i.href ? <Link to={i.href} className="underline-offset-4 hover:underline">{i.text}</Link> : <span>{i.text}</span>}</li>)}{b.items.length > 12 && <li className="text-muted-foreground">e mais {b.items.length - 12}</li>}</ul>}
    <p className="mt-3 text-xs text-muted-foreground">{b.limits}</p>
    <p className="mt-1 text-xs text-muted-foreground">Última informação: {brDateTime(b.lastInfoAt)}</p>
  </section>;
}

function AlertSettings({ view, preview }: { view: Extract<HealthView, { ok: true }>; preview: boolean }) {
  const cache = useQueryClient(); const save = useServerFn(saveHealthAlertSettings); const test = useServerFn(sendHealthTestEmail);
  const [list, setList] = useState<string[]>(() => [...view.settings.recipients, ...Array(Math.max(0, HEALTH_LIMITS.recipientsMax - view.settings.recipients.length)).fill('')].slice(0, HEALTH_LIMITS.recipientsMax));
  const [enabled, setEnabled] = useState(view.settings.enabled); const [busy, setBusy] = useState<'save' | 'test' | null>(null); const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (preview) return; setBusy('save'); setError(''); try { const x = await save({ data: { recipients: list, enabled } }); if (!x.ok) setError(x.mensagem); else { toast.success('Avisos salvos.'); await cache.invalidateQueries({ queryKey: ['system-health'] }); } } finally { setBusy(null); } };
  const sendTest = async () => { if (preview) return; setBusy('test'); try { const x = await test(); if (!x.ok) toast.error(x.mensagem); else toast.success('E-mail de teste enviado.'); await cache.invalidateQueries({ queryKey: ['system-health'] }); } finally { setBusy(null); } };
  return <section className="glass-panel mt-8 p-6" aria-labelledby="health-alerts">
    <h2 id="health-alerts" className="section-title"><BellRing className="size-5" aria-hidden />Avisos por e-mail</h2>
    <p className="mt-2 text-sm text-muted-foreground">Enviados por notem &lt;avisos@notemfiscal.com.br&gt; quando algo entra em Problema, a cada {HEALTH_LIMITS.reminderHours} h enquanto continuar e quando for resolvido. Atenção não gera e-mail.</p>
    {view.email.failedAt && <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-destructive"><XCircle className="size-4" aria-hidden />Último aviso não enviado ({brDateTime(view.email.failedAt)}).</p>}
    {!view.email.configured && <p className="mt-4 text-sm text-warning-foreground">A chave do Resend ainda não foi cadastrada; nenhum e-mail sai até lá.</p>}
    {view.alerts.length > 0 && <div className="mt-4 text-sm"><p className="font-semibold">Avisos em aberto</p><ul className="mt-1 space-y-1">{view.alerts.map(a => <li key={a.key}><Activity className="mr-1 inline size-3.5" aria-hidden />{a.title} — desde {brDateTime(a.since)}{a.notifiedAt ? `, último e-mail ${brDateTime(a.notifiedAt)}` : ', sem e-mail enviado'}{a.sendError ? ' (falha no envio)' : ''}</li>)}</ul></div>}
    <form className="mt-6 max-w-lg space-y-4" onSubmit={submit}>
      <fieldset className="space-y-2"><legend className="mb-1 text-sm font-semibold">Destinatários (até {HEALTH_LIMITS.recipientsMax})</legend>
        {list.map((v, i) => <Input key={i} type="email" maxLength={254} aria-label={`Destinatário ${i + 1}`} placeholder="nome@empresa.com.br" value={v} onChange={e => setList(l => l.map((x, n) => n === i ? e.target.value : x))} />)}</fieldset>
      <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Avisos ligados" />Avisos {enabled ? 'ligados' : 'desligados'}</label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={busy !== null}>{busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}Salvar</Button>
        <Button type="button" variant="outline" disabled={busy !== null || !view.settings.recipients.length} onClick={sendTest}>{busy === 'test' ? <Loader2 className="animate-spin" /> : <Mail />}Enviar e-mail de teste</Button></div>
    </form>
  </section>;
}

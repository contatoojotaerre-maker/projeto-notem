import { userMessage } from '@/lib/webhooks'
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCertificates, uploadCertificate, getAgreementQueries, checkAgreement } from '@/lib/certificates.functions';
import { certificateSituation, cooldownRemaining, formatGovernmentValue, agreementFieldLabels, translateTransmissorError, MAX_CERTIFICATE_BYTES } from '@/lib/certificates';
import { formatCnpj } from '@/lib/notem';
import { useWorkspace } from '@/components/notem/app-shell';
import { fiscalQuery } from '@/lib/fiscal.queries';
import { fiscalSchema,validReadinessCertificate } from '@/lib/fiscal';
import { formatAgreementField,agreementUnavailableMessage } from '@/lib/certificates';

const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR');
const fmtTime = (d: string) => new Date(d).toLocaleString('pt-BR');

export function CertificateTab({ companyId, organizationId, canUse }: { companyId: string; organizationId: string; canUse: boolean }) {
  const qc = useQueryClient(); const fetchCerts = useServerFn(getCertificates); const upload = useServerFn(uploadCertificate);
  const key = ['certificates', companyId];
  const { data = [], isLoading } = useQuery({ queryKey: key, queryFn: () => fetchCerts({ data: { company_id: companyId, organization_id: organizationId } }) });
  const [open, setOpen] = useState(false); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const reset = () => { setPassword(''); setError(''); if (fileRef.current) fileRef.current.value = ''; setOpen(false); };
  const active = data.find(c => c.status === 'active');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); const file = fileRef.current?.files?.[0];
    if (!file || !password) return setError('Selecione o arquivo e informe a senha.');
    if (file.size > MAX_CERTIFICATE_BYTES) return setError('O arquivo pode ter no máximo 100 KB.');
    const form = new FormData(); form.set('file', file); form.set('password', password); form.set('company_id', companyId); form.set('organization_id', organizationId);
    setBusy(true);
    try { await upload({ data: form }); toast.success('Certificado guardado.'); reset(); await Promise.all([qc.invalidateQueries({ queryKey: key }),qc.invalidateQueries({queryKey:['company-fiscal',companyId]}),qc.invalidateQueries({queryKey:['company',companyId]})]); }
    catch (err) { setError(userMessage(err,'Falha no envio.')); setPassword(''); }
    finally { setBusy(false); }
  }
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const situation = active ? certificateSituation(active.valid_from, active.valid_until) : null;
  return <div className="space-y-8">
    {active && situation ? <div className="rounded-lg border border-border p-6"><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-medium">Certificado ativo</h2><span className={situation.kind === 'valid' ? 'rounded px-2 py-1 text-xs bg-secondary' : situation.kind === 'expiring' ? 'status-badge' : 'rounded px-2 py-1 text-xs bg-destructive text-destructive-foreground'}>{situation.label}</span></div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Titular</dt><dd>{active.holder}</dd></div><div><dt className="text-muted-foreground">CNPJ</dt><dd>{formatCnpj(active.cnpj)}</dd></div><div><dt className="text-muted-foreground">Emissor</dt><dd>{active.issuer}</dd></div><div><dt className="text-muted-foreground">Validade</dt><dd>{fmt(active.valid_from)} a {fmt(active.valid_until)}</dd></div></dl></div>
      : <p className="text-sm text-muted-foreground">Nenhum certificado enviado para esta empresa.</p>}
    {canUse && (open ? <form onSubmit={submit} className="max-w-md space-y-4 rounded-lg border border-border p-6" autoComplete="off">
      <div className="space-y-2"><Label htmlFor="cert-file">Arquivo .pfx ou .p12 (até 100 KB)</Label><Input id="cert-file" ref={fileRef} type="file" accept=".pfx,.p12" /></div>
      <div className="space-y-2"><Label htmlFor="cert-pass">Senha do certificado</Label><Input id="cert-pass" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</Button><Button type="button" variant="ghost" onClick={reset} disabled={busy}>Cancelar</Button></div>
    </form> : <Button onClick={() => setOpen(true)}>{active ? 'Substituir certificado' : 'Enviar certificado'}</Button>)}
    {data.length > 0 && <div><h3 className="mb-3 font-medium">Histórico</h3><div className="overflow-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th className="py-2">Titular</th><th>Emissor</th><th>Validade</th><th>Enviado em</th><th>Situação</th></tr></thead><tbody>{data.map(c => <tr key={c.id} className="border-t border-border"><td className="py-2">{c.holder}</td><td>{c.issuer}</td><td>{fmt(c.valid_until)}</td><td>{fmtTime(c.created_at)}</td><td>{c.status === 'active' ? 'Ativo' : 'Substituído'}</td></tr>)}</tbody></table></div></div>}
  </div>;
}

export function ReadinessTab({ companyId, organizationId, canUse,cnpj }: { companyId: string; organizationId: string; canUse: boolean;cnpj:string }) {
  const {data:fiscal}=useSuspenseQuery(fiscalQuery(companyId,organizationId));
  const { profile } = useWorkspace(); const environment = (profile?.environment ?? 'production') as 'production' | 'sandbox';
  const qc = useQueryClient(); const fetchLast = useServerFn(getAgreementQueries); const check = useServerFn(checkAgreement);
  const key = ['agreement', companyId, environment];
  const { data: last, isLoading } = useQuery({ queryKey: key, queryFn: () => fetchLast({ data: { company_id: companyId, organization_id: organizationId, environment } }) });
  const [now, setNow] = useState(Date.now()); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const remaining = cooldownRemaining(last?.created_at, now);
  async function run() { setBusy(true); setMessage(''); try { const r = await check({ data: { company_id: companyId, organization_id: organizationId } }); if (r.message) setMessage(r.message); } catch (e) { setMessage(userMessage(e,'Falha na verificação.')); } finally { setBusy(false); await qc.invalidateQueries({ queryKey: key }); } }
  let parsed: { mensagem?: unknown; parametrosConvenio?: Record<string, unknown> } | null = null;
  try { parsed = last?.response_body && last.http_status ? JSON.parse(last.response_body) : null; } catch { parsed = null; }
  const fields = parsed?.parametrosConvenio && typeof parsed.parametrosConvenio === 'object' ? parsed.parametrosConvenio : null;
  const unavailable=agreementUnavailableMessage(last?.http_status,parsed?.mensagem,environment);
  const local=[['Certificado válido',fiscal.certificates.some(c=>validReadinessCertificate(c,cnpj,now))],['Configuração fiscal preenchida',fiscal.settings!==null&&fiscalSchema.safeParse(fiscal.settings).success],['Ao menos um serviço ativo',fiscal.profiles.some(p=>p.active)]] as const;
  return <div className="space-y-6"><dl className="grid gap-4 sm:grid-cols-3">{local.map(([label,ready])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{ready?'Sim':'Não'}</dd></div>)}</dl><div className="rounded-lg border border-border p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-medium">Município atendido pelo emissor nacional</h2><p className="text-sm text-muted-foreground">Ambiente: {environment === 'production' ? 'Produção' : 'Homologação'}</p></div>
      {canUse && <div className="text-right"><Button onClick={run} disabled={busy || remaining > 0}>{busy ? 'Verificando…' : last ? 'Verificar novamente' : 'Verificar'}</Button>{remaining > 0 && <p className="mt-1 text-xs text-muted-foreground">Poderá verificar novamente em {Math.ceil(remaining / 1000)} s</p>}</div>}</div>
    {message && <p role="alert" className="mt-4 text-sm text-destructive">{message}</p>}
    {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Carregando…</p> : !last ? <p className="mt-4 text-sm text-muted-foreground">Ainda não verificado neste ambiente.</p> : <div className="mt-4 space-y-3 text-sm">
      <p className="text-muted-foreground">Consultado em {fmtTime(last.created_at)}</p>
      {last.error_code ? <p className="text-destructive">{translateTransmissorError(last.error_code)}</p> : unavailable?<p className="text-destructive">{unavailable}</p>:last.http_status !== 200 ? <p className="text-destructive">O governo respondeu com status HTTP {last.http_status}.</p> : null}
      {fields && <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(fields).map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{agreementFieldLabels[k] ?? k}</dt><dd>{formatAgreementField(k,v)}</dd>{k==='situacaoEmissaoPadraoContribuintesRFB'&&<p className="text-xs text-muted-foreground">interpretação provável: 1 = habilitados por padrão</p>}</div>)}</dl>}
      {parsed?.mensagem !== undefined && parsed?.mensagem !== null && <p><span className="text-muted-foreground">Mensagem: </span>{formatGovernmentValue(parsed.mensagem)}</p>}
      <details className="rounded border border-border p-3"><summary className="cursor-pointer">Detalhes técnicos</summary><dl className="mt-2 space-y-1 font-mono text-xs"><div>URL: {last.url ?? '—'}</div><div>Status HTTP: {last.http_status ?? '—'}</div><div>Código de erro: {last.error_code ?? '—'}</div><div>Duração: {last.duration_ms ?? '—'} ms</div></dl><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{last.response_body ?? ''}</pre></details>
    </div>}
  </div></div>;
}

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/notem';
import { appLink } from '@/lib/app-url';
import { updatePreferences } from '@/lib/notem.functions';
import { changePassword } from '@/lib/account.functions';
import { DISPLAY_NAME_MESSAGE, PASSWORD_MAX, PASSWORD_MIN, displayNameError, passwordChangeError, passwordMessages } from '@/lib/account';
import { useWorkspace } from '@/components/notem/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Minha conta: name (2–80), e-mail read only, password change (current password checked on the server; the other
// sessions end, this one stays), theme and sign out. Google-only accounts set a password through the recovery e-mail.
export const Route = createFileRoute('/_authenticated/conta')({ head: () => pageHead('Minha conta'), component: Account });

function Account() {
  const w = useWorkspace(); const cache = useQueryClient(); const navigate = useNavigate(); const save = useServerFn(updatePreferences);
  const theme = w.profile?.theme ?? 'dark';
  async function signOut() { await cache.cancelQueries(); cache.clear(); await supabase.auth.signOut(); await navigate({ to: '/entrar', replace: true }); }
  async function setTheme(t: 'dark' | 'light') { try { await save({ data: { theme: t } }); await cache.invalidateQueries({ queryKey: ['workspace'] }); } catch { toast.error('Não foi possível salvar sua preferência.'); } }
  return <div className="max-w-xl"><h1 className="page-heading">Minha conta</h1>
    <NameForm initial={w.profile?.display_name ?? ''} />
    <section className="mt-10 border-t border-border pt-6"><h2 className="mb-2 text-lg font-medium">E-mail</h2><p className="break-all text-sm">{w.email}</p><p className="mt-1 text-xs text-muted-foreground">O e-mail de acesso não pode ser alterado por aqui.</p></section>
    {w.hasPassword ? <PasswordForm /> : <SetPassword email={w.email} />}
    <section className="mt-10 border-t border-border pt-6"><h2 className="mb-3 text-lg font-medium">Tema</h2><div className="flex gap-2" role="radiogroup" aria-label="Tema">{(['dark', 'light'] as const).map(t => <Button key={t} role="radio" aria-checked={theme === t} variant={theme === t ? 'secondary' : 'ghost'} onClick={() => void setTheme(t)}>{t === 'dark' ? 'Escuro' : 'Claro'}</Button>)}</div></section>
    <section className="mt-10 border-t border-border pt-6"><Button variant="outline" onClick={() => void signOut()}><LogOut />Sair</Button></section>
  </div>;
}

function NameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const save = useServerFn(updatePreferences); const cache = useQueryClient();
  async function submit(e: React.FormEvent) { e.preventDefault(); const problem = displayNameError(name); setError(problem ?? ''); if (problem) return; setBusy(true);
    try { await save({ data: { display_name: name } }); await cache.invalidateQueries({ queryKey: ['workspace'] }); toast.success('Nome salvo.'); } catch { setError('Não foi possível salvar. Tente novamente.'); } finally { setBusy(false); } }
  return <form className="mt-8 space-y-3" onSubmit={submit} noValidate><div className="form-field"><label htmlFor="account-name">Nome</label><Input id="account-name" value={name} maxLength={120} aria-invalid={Boolean(error)} aria-describedby={error ? 'account-name-error' : undefined} onChange={e => setName(e.target.value)} /></div>
    {error ? <p id="account-name-error" role="alert" className="text-sm text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{DISPLAY_NAME_MESSAGE}</p>}<Button disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button></form>;
}

function PasswordForm() {
  const change = useServerFn(changePassword); const [f, setF] = useState({ current: '', next: '', confirm: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); const problem = passwordChangeError(f); setError(problem ?? ''); if (problem) return; setBusy(true);
    try { const r = await change({ data: { current: f.current, next: f.next } }); if (!r.ok) { setError(r.mensagem); return; } setF({ current: '', next: '', confirm: '' });
      toast.success(r.othersEnded ? 'Senha trocada. As outras sessões foram encerradas; esta continua aberta.' : 'Senha trocada. Não foi possível encerrar as outras sessões agora; saia delas pelo botão Sair em cada aparelho.'); }
    catch { setError(passwordMessages.failed); } finally { setBusy(false); } }
  const field = (k: keyof typeof f, label: string, auto: string) => <div className="form-field"><label htmlFor={`password-${k}`}>{label}</label><Input id={`password-${k}`} type="password" autoComplete={auto} maxLength={PASSWORD_MAX} value={f[k]} onChange={e => setF(v => ({ ...v, [k]: e.target.value }))} /></div>;
  return <form className="mt-10 space-y-4 border-t border-border pt-6" onSubmit={submit} noValidate><h2 className="text-lg font-medium">Trocar senha</h2>
    {field('current', 'Senha atual', 'current-password')}{field('next', 'Nova senha', 'new-password')}{field('confirm', 'Confirme a nova senha', 'new-password')}
    <p className="text-xs text-muted-foreground">Pelo menos {PASSWORD_MIN} caracteres. Ao trocar, as outras sessões abertas com a sua conta são encerradas.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy}>{busy ? 'Trocando…' : 'Trocar senha'}</Button></form>;
}

function SetPassword({ email }: { email: string }) {
  const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false);
  async function send() { setBusy(true); try { const r = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appLink('/redefinir-senha') }); if (r.error) throw r.error; setSent(true); } catch { toast.error('Não foi possível enviar o e-mail agora. Tente novamente.'); } finally { setBusy(false); } }
  return <section className="mt-10 border-t border-border pt-6"><h2 className="mb-2 text-lg font-medium">Senha</h2><p className="text-sm text-muted-foreground">Você entra com o Google e ainda não tem senha na notem. Para criar uma, enviamos um link para o seu e-mail.</p>
    {sent ? <p role="status" className="mt-3 text-sm">Enviamos o link para {email}. Ele vale por tempo limitado.</p> : <Button className="mt-4" variant="outline" disabled={busy} onClick={() => void send()}>{busy ? 'Enviando…' : 'Definir senha'}</Button>}</section>;
}

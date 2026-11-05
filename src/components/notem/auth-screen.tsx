import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { appLink } from '@/lib/app-url';
import { finishSignIn } from '@/lib/notem.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from './brand';

export function AuthScreen({ mode = 'login' }: {mode?:'login'|'forgot'|'reset'|'invite'}) {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState('');
  const [show,setShow]=useState(false); const [remember,setRemember]=useState(true); const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [validLink,setValidLink]=useState(false);
  const navigate=useNavigate();const finish=useServerFn(finishSignIn);
  useEffect(()=>{
    const hash=new URLSearchParams(window.location.hash.slice(1));
    const type=hash.get('type');
    if(mode==='reset'||mode==='invite'){
      const expected=mode==='reset'?'recovery':'invite';
      setValidLink(type===expected);
      if(type!==expected)setError('Este link é inválido ou expirou. Solicite um novo e-mail.');
    } else if(hash.get('error'))setError('Acesso não autorizado. Solicite um convite ao administrador da sua organização.');
    if(mode==='login')void supabase.auth.getUser().then(async({data})=>{if(data.user){await finish();await navigate({to:'/dashboard'});}}).catch(err=>setError(err instanceof Error?err.message:'Acesso não autorizado.'));
  },[mode,finish,navigate]);
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
    if(mode==='forgot'){const result=await supabase.auth.resetPasswordForEmail(email,{redirectTo:appLink('/redefinir-senha')});if(result.error)throw result.error;setMessage('Se este e-mail tiver acesso à notem, você receberá um link para redefinir sua senha.');}
    else if(mode==='reset'||mode==='invite'){
      if(!validLink)throw new Error('Solicite um novo link.');if(password.length<8)throw new Error('Use pelo menos 8 caracteres.');if(password!==confirm)throw new Error('As senhas não coincidem.');
      const verified=await supabase.auth.getUser();if(!verified.data.user)throw new Error('Link expirado. Solicite um novo e-mail.');
      const result=await supabase.auth.updateUser({password});if(result.error)throw result.error;
      if(mode==='invite')await finish();await navigate({to:'/dashboard'});
    } else {sessionStorage.setItem('notem-session-only',remember?'false':'true');const result=await supabase.auth.signInWithPassword({email,password});if(result.error)throw new Error('E-mail ou senha inválidos. O acesso é permitido apenas por convite.');
      await finish();await navigate({to:'/dashboard'});
    }
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível continuar. Tente novamente.');}finally{setBusy(false);}}
  async function google(){setBusy(true);setError('');sessionStorage.setItem('notem-session-only',remember?'false':'true');const result=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${window.location.origin}/entrar`}});if(result.error){setError('Não foi possível entrar com Google. Verifique a configuração do provedor.');setBusy(false);}}
  const title=mode==='login'?'Acesse sua conta':mode==='forgot'?'Esqueceu a senha?':mode==='invite'?'Defina sua senha':'Redefina sua senha';
  return <main className="login-page">
    <section className="login-form-area"><div className="glass-panel login-card"><div className="mb-9"><Brand/></div><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-2 mb-8 text-sm text-muted-foreground">{mode==='login'?'Bem-vindo de volta.':mode==='forgot'?'Informe o e-mail da sua conta.':'Escolha uma senha para sua conta.'}</p>
      {message?<div role="status" className="mb-6 text-sm text-foreground">{message}</div>:<form onSubmit={submit} className="space-y-5">
      {(mode==='login'||mode==='forgot')&&<div><label className="login-label" htmlFor="email">E-mail</label><Input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" required className="h-11"/></div>}
      {mode!=='forgot'&&<div><label className="login-label" htmlFor="password">{mode==='login'?'Senha':'Nova senha'}</label><div className="relative"><Input id="password" type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:8} className="h-11 pr-12"/><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1" onClick={()=>setShow(!show)} aria-label={show?'Ocultar senha':'Mostrar senha'} title={show?'Ocultar senha':'Mostrar senha'}>{show?<EyeOff/>:<Eye/>}</Button></div></div>}
      {(mode==='reset'||mode==='invite')&&<div><label className="login-label" htmlFor="confirm">Confirme a senha</label><Input id="confirm" type={show?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required className="h-11"/></div>}
      {mode==='login'&&<div className="flex flex-wrap items-center justify-between gap-2 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Lembrar de mim</label><Link to="/esqueci-senha" className="text-muted-foreground hover:text-foreground">Esqueceu a senha?</Link></div>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy||((mode==='reset'||mode==='invite')&&!validLink)} className="h-11 w-full">{busy?<Loader2 className="animate-spin"/>:null}{mode==='login'?'Entrar':mode==='forgot'?'Enviar link':'Salvar senha'}<ArrowRight/></Button>
      </form>}
      {mode==='login'?<><div className="my-6 flex items-center gap-4 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border"/>ou<div className="h-px flex-1 bg-border"/></div><Button variant="outline" className="h-11 w-full" disabled={busy} onClick={google}><span className="text-base font-semibold">G</span>Entrar com Google</Button><p className="mt-7 text-center text-xs text-muted-foreground">Acesso exclusivo para usuários convidados.</p></>:<Link to="/entrar" className="mt-6 block text-center text-xs text-muted-foreground">Voltar para entrar</Link>}
    </div></section>
  </main>;
}
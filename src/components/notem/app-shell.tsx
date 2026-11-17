import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { SandboxChangeAlerts } from './sandbox-change-alerts';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { orgAlertsQuery, supportContactQuery } from '@/lib/panel-home.queries';
import { useServerFn } from '@tanstack/react-start';
import { Building2, FileText, Home, Layers, Bell, Code2, Settings, CircleHelp, ChevronsLeft, Menu, Sun, Moon, LogOut, TriangleAlert, ArrowRight, LifeBuoy, MessageSquare, FileCode2, X, UserRound, ShieldCheck, Mail, MessageCircle, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { workspaceQuery } from '@/lib/notem.queries';
import { getWorkspace, updatePreferences, acceptInvitation } from '@/lib/notem.functions';
import { canManageOrganization } from '@/lib/notem';
import { orgSwitchTarget } from '@/lib/panel-nav';
import { Brand } from './brand';
import { NavGroup, useNavGroups } from './nav-group';
import { currentNavGroup, navSubitemActive } from '@/lib/nav-groups';

type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
const WorkspaceContext=createContext<Workspace|null>(null);
/** Workspace when rendered inside the panel shell; null elsewhere (error screens outside the shell). */
export function useOptionalWorkspace(){return useContext(WorkspaceContext);}
export function useWorkspace(){const context=useContext(WorkspaceContext);if(!context)throw new Error('Workspace unavailable');return context;}
export function useOrganization(slug:string){const workspace=useWorkspace();const organization=workspace.organizations.find(o=>o.slug===slug);const role=workspace.memberships.find(m=>m.organization_id===organization?.id)?.role;return {organization,role,isAdmin:workspace.isAdmin};}
/** Administração: only the screens that exist (the "em breve" placeholders redirect to Organizações). */
const adminItems=[{title:'Organizações',section:'organizacoes',icon:Landmark},{title:'Mensagens de rejeição',section:'mensagens-de-rejeicao',icon:MessageSquare},{title:'Leiaute fiscal',section:'leiaute-fiscal',icon:FileCode2},{title:'Suporte',section:'suporte',icon:LifeBuoy}];
/** Public API documentation lives at docs.notemfiscal.com.br in the final phase; until then the link stays hidden. */
export const API_DOCS_URL: string | null = null;
const whatsappLabel = (n: string) => `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, -4)}-${n.slice(-4)}`;
export function AppShell(){
 const {data:workspace}=useSuspenseQuery(workspaceQuery());const cache=useQueryClient();const navigate=useNavigate();const path=useRouterState({select:s=>s.location.pathname});const searchStr=useRouterState({select:s=>s.location.searchStr});const save=useServerFn(updatePreferences);const accept=useServerFn(acceptInvitation);const [collapsed,setCollapsed]=useCollapsed();const accountRef=useRef<HTMLDivElement>(null);const [mobile,setMobile]=useState(false);const [account,setAccount]=useState(false);
 const slug=path.split('/')[1]==='o'?path.split('/')[2]:undefined;
 const current=workspace.organizations.find(o=>o.slug===slug)??workspace.organizations.find(o=>o.id===workspace.profile?.last_organization_id)??workspace.organizations[0];
 const role=workspace.memberships.find(m=>m.organization_id===current?.id)?.role;
 const theme=workspace.profile?.theme??'dark'; const environment=workspace.profile?.environment??'production';
 const alerts=useQuery({...orgAlertsQuery({organization_id:current?.id??'00000000-0000-4000-8000-000000000000',environment}),enabled:Boolean(current)});const alertCount=alerts.data?.alerts.length??0;
 useEffect(()=>{document.documentElement.dataset['theme']=theme;},[theme]);
 // The account panel closes on any click outside it and on Esc.
 useEffect(()=>{if(!account)return;const down=(e:PointerEvent)=>{if(accountRef.current&&!accountRef.current.contains(e.target as Node))setAccount(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setAccount(false);};document.addEventListener('pointerdown',down);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('keydown',key);};},[account]);
 async function preference(data:Parameters<typeof save>[0]['data']){try{await save({data});await cache.invalidateQueries({queryKey:['workspace']});}catch{toast.error('Não foi possível salvar sua preferência.');}}
 async function signOut(){await cache.cancelQueries();cache.clear();await supabase.auth.signOut();await navigate({to:'/entrar',replace:true});}
 async function acceptPending(id:string){try{await accept({data:{id}});await cache.invalidateQueries({queryKey:['workspace']});toast.success('Convite aceito.');}catch{toast.error('Não foi possível aceitar o convite.');}}
 // Switching organization keeps the section (a detail goes to its list); a section the new role cannot open goes to Início.
 async function switchOrganization(id:string){const next=workspace.organizations.find(o=>o.id===id);if(!next)return;await preference({last_organization_id:next.id});const nextRole=workspace.memberships.find(m=>m.organization_id===next.id)?.role;const t=orgSwitchTarget(path,canManageOrganization(nextRole,workspace.isAdmin),searchStr);const orgSlug=next.slug;
  if(t.to==='notas')return navigate({to:'/o/$orgSlug/notas',params:{orgSlug}});if(t.to==='recebidas')return navigate({to:'/o/$orgSlug/notas/recebidas',params:{orgSlug}});if(t.to==='empresas')return navigate({to:'/o/$orgSlug/empresas',params:{orgSlug}});if(t.to==='integracoes')return navigate({to:'/o/$orgSlug/integracoes',params:{orgSlug}});
  return navigate({to:'/o/$orgSlug/$section',params:{orgSlug,section:t.section},search:t.aba?{aba:t.aba}:{}});}
 const manage=canManageOrganization(role,workspace.isAdmin);const base=current?`/o/${current.slug}`:'';const sub=navSubitemActive(path,searchStr);
 const close=()=>setMobile(false);
 // Notas and Organização are collapsible groups; the icon-only menu shows their sub-items in a floating menu.
 const groups=useNavGroups(currentNavGroup(path),path+searchStr);const iconOnly=collapsed&&!mobile;
 return <WorkspaceContext.Provider value={workspace}><div className={`${collapsed?'app-collapsed ':''}${mobile?'app-mobile-open':''}`}>
 {mobile&&<div className="menu-toggle fixed inset-0 z-20 bg-background/80" onClick={close}/>}
 <aside className="app-sidebar"><div className="sidebar-brand-row">{current?<Link to="/o/$orgSlug/$section" params={{orgSlug:current.slug,section:'inicio'}} aria-label="notem · início" onClick={close}><span className="sidebar-label"><Brand/></span><span className="sidebar-collapsed-brand"><Brand icon/></span></Link>:<Link to="/dashboard" aria-label="notem · início"><span className="sidebar-label"><Brand/></span><span className="sidebar-collapsed-brand"><Brand icon/></span></Link>}<Button variant="ghost" size="icon" className="menu-toggle" onClick={close} aria-label="Fechar menu"><X/></Button></div>
  <div className="flex-1 overflow-y-auto px-3 pb-5"><p className="sidebar-label mb-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">{current?.name??'Seu espaço'}</p>
 <nav className="space-y-1" aria-label="Menu da organização">{current?<>
  <Link to="/o/$orgSlug/$section" params={{orgSlug:current.slug,section:'inicio'}} className="nav-item" title="Início" data-active={path===`${base}/inicio`} onClick={close}><Home size={18}/><span className="sidebar-label">Início</span></Link>
  <NavGroup id="notas" label="Notas" icon={FileText} open={groups.isOpen('notas')} onToggle={()=>groups.toggle('notas')} iconOnly={iconOnly} onNavigate={close} items={[
   {key:'emitidas',label:'Emitidas',active:sub.emitidas,render:({children,...p})=><Link to="/o/$orgSlug/notas" params={{orgSlug:current.slug}} {...p}>{children}</Link>},
   {key:'recebidas',label:'Recebidas',active:sub.recebidas,render:({children,...p})=><Link to="/o/$orgSlug/notas/recebidas" params={{orgSlug:current.slug}} {...p}>{children}</Link>}]}/>
  <Link to="/o/$orgSlug/empresas" params={{orgSlug:current.slug}} className="nav-item" title="Empresas" data-active={path.startsWith(`${base}/empresas`)} onClick={close}><Building2 size={18}/><span className="sidebar-label">Empresas</span></Link>
  <Link to="/o/$orgSlug/$section" params={{orgSlug:current.slug,section:'alertas'}} className="nav-item" title="Alertas" data-active={path===`${base}/alertas`} onClick={close}><Bell size={18}/><span className="sidebar-label">Alertas</span>{alertCount>0&&<span className="nav-count" aria-label={`${alertCount} alertas`}>{alertCount>99?'99+':alertCount}</span>}</Link>
  <Link to="/o/$orgSlug/integracoes" params={{orgSlug:current.slug}} className="nav-item" title="Integrações" data-active={path.startsWith(`${base}/integracoes`)} onClick={close}><Code2 size={18}/><span className="sidebar-label">Integrações</span></Link>
  {manage&&<NavGroup id="organizacao" label="Organização" icon={Settings} open={groups.isOpen('organizacao')} onToggle={()=>groups.toggle('organizacao')} iconOnly={iconOnly} onNavigate={close} items={[
   {key:'dados',label:'Dados',active:sub.dados,render:({children,...p})=><Link to="/o/$orgSlug/$section" params={{orgSlug:current.slug,section:'organizacao'}} search={{}} {...p}>{children}</Link>},
   {key:'equipe',label:'Equipe',active:sub.equipe,render:({children,...p})=><Link to="/o/$orgSlug/$section" params={{orgSlug:current.slug,section:'organizacao'}} search={{aba:'equipe'}} {...p}>{children}</Link>}]}/>}
 </>:<Link to="/dashboard" className="nav-item" data-active="true"><Home size={18}/><span className="sidebar-label">Início</span></Link>}</nav>
 {workspace.isAdmin&&<><div className="my-6 border-t border-border"/><p className="sidebar-label mb-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Administração</p><nav className="space-y-1" aria-label="Administração">{adminItems.map(item=><Link key={item.section} to={item.section==='organizacoes'?'/admin/organizacoes':'/admin/$section'} params={item.section==='organizacoes'?{}:{section:item.section}} className="nav-item" title={item.title} data-active={path===`/admin/${item.section}`} onClick={close}><item.icon size={18}/><span className="sidebar-label">{item.title}</span></Link>)}</nav></>}
 </div><div className="flex items-center justify-between border-t border-border p-4"><span className="sidebar-label text-[10px] text-muted-foreground">notem · NFS-e nacional</span><Button variant="ghost" size="icon" title="Recolher menu" aria-label="Recolher menu" onClick={()=>setCollapsed(!collapsed)}><ChevronsLeft/></Button></div></aside>
 <div className="app-main">{environment==='sandbox'?<div className="homologation-banner" role="status"><TriangleAlert size={15}/><span>Ambiente de homologação — notas sem validade fiscal</span></div>:<div className="production-banner" role="status"><ShieldCheck size={15}/><span>Produção — notas com validade fiscal</span></div>}
 <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 lg:px-9"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="menu-toggle" aria-label="Abrir menu" onClick={()=>setMobile(true)}><Menu/></Button><Building2 size={17} className="text-muted-foreground"/>
 <select aria-label="Organização" className="field-select topbar-org" value={current?.id??''} onChange={e=>void switchOrganization(e.target.value)}>{workspace.organizations.length?workspace.organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>):<option value="">Sem organização</option>}</select><span className="h-5 border-l border-border"/><select aria-label="Ambiente" className="field-select" value={environment} onChange={e=>void preference({environment:e.target.value==='sandbox'?'sandbox':'production'})}><option value="production">Produção</option><option value="sandbox">Homologação</option></select></div>
 <div className="flex items-center gap-3"><HelpButton/><Button variant="ghost" size="icon" title={theme==='dark'?'Usar tema claro':'Usar tema escuro'} aria-label={theme==='dark'?'Usar tema claro':'Usar tema escuro'} onClick={()=>void preference({theme:theme==='dark'?'light':'dark'})}>{theme==='dark'?<Sun/>:<Moon/>}</Button><div className="relative" ref={accountRef}><Button variant="secondary" size="icon" aria-label="Menu do usuário" aria-expanded={account} onClick={()=>setAccount(!account)}>{(workspace.profile?.display_name||workspace.email||'U').slice(0,1).toUpperCase()}</Button>{account&&<div className="glass-panel absolute right-0 top-12 z-50 min-w-60 p-4"><p className="text-sm font-medium">{workspace.profile?.display_name||'Minha conta'}</p><p className="mt-1 break-all text-xs text-muted-foreground">{workspace.email}</p><Button variant="ghost" className="mt-4 w-full justify-start" asChild><Link to="/conta" onClick={()=>setAccount(false)}><UserRound/>Minha conta</Link></Button><Button variant="ghost" className="w-full justify-start" onClick={signOut}><LogOut/>Sair</Button></div>}</div></div></header>
 {workspace.invitations.filter(i=>i.requires_explicit_acceptance).map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-8 py-4"><span>Você foi convidado para a organização <strong>{i.organization_name}</strong></span><Button onClick={()=>void acceptPending(i.id)}>Aceitar convite<ArrowRight/></Button></div>)}
 <main className="mx-auto max-w-[1500px] px-5 py-8 lg:px-10 lg:py-10">{slug&&current&&current.slug===slug&&<SandboxChangeAlerts organizationId={current.id}/>}<Outlet/></main>
 </div></div></WorkspaceContext.Provider>;
}
/** "?" in the top bar: how to issue through the API, documentation (hidden until it exists) and support (hidden when empty). */
function HelpButton(){const [open,setOpen]=useState(false);const contact=useQuery({...supportContactQuery(),enabled:open});const c=contact.data;
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Ajuda" title="Ajuda"><CircleHelp/></Button></PopoverTrigger><PopoverContent align="end" className="w-80 space-y-4 text-sm"><p className="font-medium">Ajuda</p><p className="text-muted-foreground">As notas são emitidas pelo seu sistema, pela API da notem, com a chave da integração. Aqui no painel você acompanha as notas, as empresas e as integrações.</p>
  {API_DOCS_URL&&<a className="block underline underline-offset-4" href={API_DOCS_URL} target="_blank" rel="noreferrer">Documentação da API</a>}
  {c&&(c.email||c.whatsapp)&&<div className="space-y-2 border-t border-border pt-3"><p className="text-xs text-muted-foreground">Suporte</p>{c.email&&<a className="flex items-center gap-2 underline underline-offset-4" href={`mailto:${c.email}`}><Mail size={15}/>{c.email}</a>}{c.whatsapp&&<a className="flex items-center gap-2 underline underline-offset-4" href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={15}/>{whatsappLabel(c.whatsapp)}</a>}</div>}</PopoverContent></Popover>;}
const COLLAPSED_KEY='notem-menu-recolhido';
/** "Recolher menu" remembered in this browser; storage failures are ignored (the menu just opens expanded). */
function useCollapsed():[boolean,(v:boolean)=>void]{const [value,setValue]=useState(false);useEffect(()=>{try{setValue(window.localStorage.getItem(COLLAPSED_KEY)==='1');}catch{/* storage unavailable */}},[]);return [value,(v:boolean)=>{setValue(v);try{window.localStorage.setItem(COLLAPSED_KEY,v?'1':'0');}catch{/* storage unavailable */}}];}
export function ComingSoon({title}:{title:string}){return <><h1 className="page-heading">{title}</h1><div className="empty-state"><Layers size={36} strokeWidth={1} className="text-muted-foreground"/><h2 className="text-lg font-medium">Disponível em breve</h2></div></>;}

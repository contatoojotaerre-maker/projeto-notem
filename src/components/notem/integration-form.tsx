import { userMessage } from '@/lib/webhooks'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Save } from 'lucide-react'
import { useServerFn } from '@tanstack/react-start'
import { saveIntegration, getIntegrations } from '@/lib/integrations.functions'
import { toast } from 'sonner'
type Data=Awaited<ReturnType<typeof getIntegrations>>
export function IntegrationForm({organizationId,companies,initial,selected=[],onSaved,readOnly=false}:{organizationId:string,companies:Data['companies'],initial?:Data['rows'][number],selected?:string[],onSaved:(id:string)=>void,readOnly?:boolean}){
 const [name,setName]=useState(initial?.name??'');const [description,setDescription]=useState(initial?.description??'');const [active,setActive]=useState(initial?.active??true);const [scope,setScope]=useState<'all'|'selected'>(initial?.company_scope==='selected'?'selected':'all');const [ids,setIds]=useState(selected);const [search,setSearch]=useState('');const [busy,setBusy]=useState(false);const save=useServerFn(saveIntegration)
 return <form className="space-y-6" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const r=await save({data:{organization_id:organizationId,id:initial?.id,name,description,active,company_scope:scope,company_ids:ids}});onSaved(r.id)}catch(e){toast.error(userMessage(e,'Não foi possível salvar.'))}finally{setBusy(false)}}}>
 <fieldset disabled={readOnly||busy} className="space-y-6"><div className="form-field"><label htmlFor="integration-name">Nome</label><Input id="integration-name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></div><div className="form-field"><label htmlFor="integration-description">Descrição</label><Textarea id="integration-description" maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)}/></div>
 <label className="flex items-center gap-3"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Integração ativa</label>
 <div className="space-y-3"><p className="font-medium">Empresas autorizadas</p><label className="flex items-center gap-3"><input type="radio" name="scope" checked={scope==='all'} onChange={()=>setScope('all')}/>Todas as empresas</label><label className="flex items-center gap-3"><input type="radio" name="scope" checked={scope==='selected'} onChange={()=>setScope('selected')}/>Empresas selecionadas</label></div>
 {scope==='selected'&&<div className="space-y-3"><Input aria-label="Buscar empresas autorizadas" placeholder="Buscar por nome ou CNPJ" value={search} onChange={e=>setSearch(e.target.value)}/><p className="text-sm text-muted-foreground">{ids.length} selecionadas</p><div className="max-h-64 overflow-y-auto divide-y divide-border">{companies.filter(c=>`${c.legal_name} ${c.cnpj}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c=><label key={c.id} className="flex items-start gap-3 py-3"><input type="checkbox" checked={ids.includes(c.id)} onChange={e=>setIds(e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/><span>{c.legal_name}<span className="block text-xs text-muted-foreground">{c.cnpj}</span></span></label>)}</div>{ids.length===0&&<p className="text-sm text-destructive">Selecione ao menos uma empresa.</p>}</div>}
 </fieldset>{!readOnly&&<Button disabled={busy||(scope==='selected'&&!ids.length)}><Save/>{busy?'Salvando…':initial?'Salvar alterações':'Criar integração'}</Button>}
 </form>
}
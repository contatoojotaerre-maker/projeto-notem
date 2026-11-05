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
 const [name,setName]=useState(initial?.name??'');const [description,setDescription]=useState(initial?.description??'');const [active,setActive]=useState(initial?.active??true);const [busy,setBusy]=useState(false);const save=useServerFn(saveIntegration)
 return <form className="space-y-6" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const r=await save({data:{organization_id:organizationId,id:initial?.id,name,description,active,company_scope:'all',company_ids:[]}});onSaved(r.id)}catch(e){toast.error(userMessage(e,'Não foi possível salvar.'))}finally{setBusy(false)}}}>
 <fieldset disabled={readOnly||busy} className="space-y-6"><div className="form-field"><label htmlFor="integration-name">Nome</label><Input id="integration-name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></div><div className="form-field"><label htmlFor="integration-description">Descrição</label><Textarea id="integration-description" maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)}/></div>
 <label className="flex items-center gap-3"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Integração ativa</label>
 <p className="text-sm text-muted-foreground">Esta integração opera todas as empresas da organização.</p>
 </fieldset>{!readOnly&&<Button disabled={busy}><Save/>{busy?'Salvando…':initial?'Salvar alterações':'Criar integração'}</Button>}
 </form>
}
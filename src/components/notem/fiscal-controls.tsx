import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { searchFiscalCatalog } from '@/lib/fiscal.functions';
import type { CatalogChoice,CatalogName } from '@/lib/fiscal';

export function NumberSelect({id,label,value,options,onChange,disabled=false}:{id:string;label:string;value:number|null;options:readonly(readonly[number,string])[];onChange:(value:number)=>void;disabled?:boolean}) {
 return <div className="space-y-2 min-w-0"><Label htmlFor={id}>{label}</Label><Select value={value===null?'':String(value)} onValueChange={v=>onChange(Number(v))} disabled={disabled}><SelectTrigger id={id} className="w-full h-auto min-h-10 text-left whitespace-normal"><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{options.map(([code,text])=><SelectItem key={code} value={String(code)} className="whitespace-normal">{text}</SelectItem>)}</SelectContent></Select></div>;
}
export function CatalogPicker({catalog,label,value,choice,onChange,disabled=false,required=false}:{catalog:CatalogName;label:string;value:string|null;choice?:CatalogChoice|null;onChange:(choice:CatalogChoice|null)=>void;disabled?:boolean;required?:boolean}) {
 const [term,setTerm]=useState('');const [open,setOpen]=useState(false);const search=useServerFn(searchFiscalCatalog);
 const result=useQuery({queryKey:['fiscal-catalog',catalog,term.trim()],queryFn:()=>search({data:{catalog,search:term}}),enabled:open});
 return <div className="space-y-2 min-w-0"><Label htmlFor={`catalog-${catalog}`}>{label}{required?' *':''}</Label>
 {!disabled&&<Input id={`catalog-${catalog}`} value={term} onFocus={()=>setOpen(true)} onChange={e=>{setTerm(e.target.value);setOpen(true);}} placeholder="Buscar por código ou descrição"/>}
 {open&&!disabled&&<div className="max-h-64 overflow-auto border border-border rounded p-1" role="listbox" aria-label={label}>
 {result.isError?<p role="alert" className="p-3 text-sm text-destructive">Não foi possível buscar no catálogo.</p>:result.data?.catalogEmpty?<p className="p-3 text-sm text-muted-foreground">Catálogo ainda não importado.</p>:term.trim().length<2?<p className="p-3 text-sm text-muted-foreground">Digite pelo menos 2 caracteres.</p>:result.isFetching?<p className="p-3 text-sm text-muted-foreground">Buscando…</p>:result.data?.rows.length?result.data.rows.map(c=><Button key={c.code} variant="ghost" type="button" role="option" aria-selected={value===c.code} className="w-full h-auto justify-start whitespace-normal text-left py-3" onClick={()=>{onChange(c);setOpen(false);setTerm('');}}><span>{c.description}</span></Button>):<p className="p-3 text-sm text-muted-foreground">Nenhum serviço encontrado.</p>}
 <Button variant="ghost" type="button" onClick={()=>setOpen(false)}>Fechar</Button></div>}
 {value?<div className="text-sm break-words"><p className="mt-1 text-muted-foreground whitespace-pre-wrap">{choice?.description??'Descrição indisponível'}</p><details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Detalhes técnicos</summary><p className="py-2 font-mono">Código: {value}</p></details>{!disabled&&!required&&<Button type="button" variant="ghost" size="sm" onClick={()=>onChange(null)}>Remover seleção</Button>}</div>:disabled?<p className="text-sm text-muted-foreground">—</p>:null}
 </div>;
}
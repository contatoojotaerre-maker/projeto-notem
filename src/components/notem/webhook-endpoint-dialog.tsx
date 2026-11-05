import { useState } from 'react'
import { Check, ChevronsUpDown, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { webhookInput, webhookTypes, eventLabels, userMessage, webhookGroups, groupEvents, groupState, subscriptionMatches, type WebhookSubscription } from '@/lib/webhooks'
import { WebhookCurlExample } from './webhook-curl-example'

export type Company = { id: string; legal_name: string; cnpj: string }
export type WebhookForm = { id?: string; url: string; description: string; events: WebhookSubscription[]; company_id: string | null; auth_header: string; auth_value: string; auth_clear: boolean; auth_configured: boolean }
export const emptyWebhookForm: WebhookForm = { url: '', description: '', events: ['webhook.teste'], company_id: null, auth_header: '', auth_value: '', auth_clear: false, auth_configured: false }

type Props = { form: WebhookForm | null; onClose: () => void; onSave: (data: ReturnType<typeof webhookInput.parse>) => Promise<void>; companies: Company[]; org: string; integration: string; environment: 'sandbox' | 'production' }

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="space-y-3"><div><h3 className="text-sm font-medium">{title}</h3>{hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}</div>{children}</section>
}

export function WebhookEndpointDialog(props: Props) {
  return <Dialog open={props.form !== null} onOpenChange={o => { if (!o) props.onClose() }}>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-[720px] sm:max-w-[720px] max-h-[88dvh] p-0 gap-0 flex flex-col overflow-hidden">
      {props.form && <Body key={props.form.id ?? 'new'} {...props} form={props.form} />}
    </DialogContent>
  </Dialog>
}

function Body({ form: initial, onClose, onSave, companies, org, integration, environment }: Props & { form: WebhookForm }) {
  const [form, setForm] = useState<WebhookForm>(initial)
  const [busy, setBusy] = useState(false)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(initial.auth_configured || !!initial.auth_header)
  const [custom, setCustom] = useState<string | null>(null)
  const company = companies.find(c => c.id === form.company_id)
  const toggleGroup = (g: typeof webhookGroups[number]) => {
    const st = groupState(form.events, g)
    const rest = form.events.filter(e => !g.wildcards.includes(e as never) && !groupEvents(g).includes(e as never))
    setForm({ ...form, events: st.mode === 'none' ? [...rest, ...g.wildcards] : rest })
  }
  const toggleEvent = (g: typeof webhookGroups[number], t: typeof webhookTypes[number]) => {
    const members = groupEvents(g)
    const current = members.filter(m => subscriptionMatches(form.events, m))
    const next = current.includes(t) ? current.filter(m => m !== t) : [...current, t]
    const rest = form.events.filter(e => !g.wildcards.includes(e as never) && !members.includes(e as never))
    setForm({ ...form, events: [...rest, ...next] })
  }
  const exampleType = (webhookTypes.find(t => t !== 'webhook.teste' && subscriptionMatches(form.events, t)) ?? 'webhook.teste')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const { auth_configured: _c, ...fields } = form
    const events = Array.from(new Set<WebhookSubscription>(['webhook.teste', ...form.events]))
    if (events.length === 1) { toast.error('Escolha pelo menos um grupo ou evento.'); return }
    const parsed = webhookInput.safeParse({ ...fields, events, organization_id: org, integration_id: integration, environment })
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Confira os campos.'); return }
    setBusy(true)
    try { await onSave(parsed.data) } catch (err) { toast.error(userMessage(err, 'Não foi possível salvar.')) } finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
    <DialogHeader className="px-6 pt-6 pb-4 border-b border-border"><DialogTitle>{form.id ? 'Editar endereço' : 'Adicionar endereço'}</DialogTitle></DialogHeader>
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-5">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-7 min-w-0">
          <Section title="Destino" hint="Endereço HTTPS público que receberá os eventos.">
            <div className="form-field"><label htmlFor="webhook-url">URL HTTPS</label><Input id="webhook-url" type="url" required maxLength={2048} placeholder="https://seu-sistema.com.br/webhooks/notem" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></div>
            <div className="form-field"><label htmlFor="webhook-description">Descrição</label><Input id="webhook-description" maxLength={2000} placeholder="Opcional" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </Section>
          <Section title="Empresa" hint="Receba eventos de uma empresa ou de todas.">
            <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
              <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={companyOpen} aria-label="Empresa" className="w-full justify-between font-normal"><span className="truncate">{company ? `${company.legal_name} · ${company.cnpj}` : 'Todas as empresas autorizadas'}</span><ChevronsUpDown className="opacity-50" /></Button></PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) || (search.replace(/\D/g, '') && value.includes(search.replace(/\D/g, ''))) ? 1 : 0}>
                  <CommandInput placeholder="Buscar por nome ou CNPJ" />
                  <CommandList><CommandEmpty>Nenhuma empresa encontrada</CommandEmpty><CommandGroup>
                    <CommandItem value="todas as empresas autorizadas" onSelect={() => { setForm({ ...form, company_id: null }); setCompanyOpen(false) }}><Check className={cn(form.company_id ? 'opacity-0' : 'opacity-100')} />Todas as empresas autorizadas</CommandItem>
                    {companies.map(c => <CommandItem key={c.id} value={`${c.legal_name} ${c.cnpj}`} onSelect={() => { setForm({ ...form, company_id: c.id }); setCompanyOpen(false) }}><Check className={cn(form.company_id === c.id ? 'opacity-100' : 'opacity-0')} /><span className="truncate">{c.legal_name} · {c.cnpj}</span></CommandItem>)}
                  </CommandGroup></CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Section>
          <section className="border-t border-border pt-5">
            <button type="button" className="flex w-full items-center justify-between text-sm font-medium" aria-expanded={authOpen} onClick={() => setAuthOpen(!authOpen)}>Autorização (opcional)<ChevronDown className={cn('size-4 transition-transform', authOpen && 'rotate-180')} /></button>
            {authOpen && <div className="space-y-4 mt-4">
              <p className="text-xs text-muted-foreground">Chave enviada em cada entrega, guardada cifrada. A assinatura continua sempre enviada.</p>
              <div className="form-field"><label htmlFor="webhook-auth-value">Chave de autorização</label><Input id="webhook-auth-value" type="password" autoComplete="off" maxLength={1024} placeholder={form.auth_configured && !form.auth_clear ? 'Chave salva; preencha para substituir' : ''} value={form.auth_value} onChange={e => setForm({ ...form, auth_value: e.target.value, auth_clear: false })} />{form.auth_configured && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.auth_clear} onChange={e => setForm({ ...form, auth_clear: e.target.checked, auth_value: '' })} />Remover a chave salva</label>}</div>
              <div className="form-field"><label htmlFor="webhook-auth-header">Cabeçalho</label><Input id="webhook-auth-header" maxLength={64} placeholder="Authorization" value={form.auth_header} onChange={e => setForm({ ...form, auth_header: e.target.value })} /></div>
            </div>}
          </section>
        </div>
        <div className="min-w-0">
          <Section title="Eventos" hint="Marcar um grupo inclui também eventos que forem adicionados a ele no futuro.">
            <div className="space-y-3">
              {webhookGroups.map(g => { const st = groupState(form.events, g); const total = groupEvents(g).length; const open = custom === g.id; return <div key={g.id} className={cn('rounded-md border p-4 transition-colors', st.mode !== 'none' ? 'border-primary bg-accent/40' : 'border-border')}>
                <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" className="mt-1" checked={st.mode === 'all'} ref={el => { if (el) el.indeterminate = st.mode === 'some' }} onChange={() => toggleGroup(g)} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{g.label}</span><span className="block text-xs text-muted-foreground">{st.mode === 'all' ? 'Grupo inteiro, incluindo eventos futuros' : st.mode === 'some' ? `${st.count} de ${total} eventos` : `${total} eventos`}</span></span></label>
                <button type="button" className="mt-2 text-xs text-primary underline-offset-2 hover:underline" onClick={() => setCustom(open ? null : g.id)}>{open ? 'Fechar personalização' : 'Personalizar eventos'}</button>
                {open && <div className="mt-3 space-y-2 border-t border-border pt-3">{groupEvents(g).map(t => <label key={t} className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={subscriptionMatches(form.events, t)} onChange={() => toggleEvent(g, t)} /><span className="min-w-0"><span className="block text-sm">{eventLabels[t]}</span><code className="text-xs text-muted-foreground break-all">{t}</code></span></label>)}<p className="text-xs text-muted-foreground">Escolher eventos individualmente não inclui eventos futuros do grupo.</p></div>}
              </div> })}
              <p className="text-xs text-muted-foreground">Teste da conexão (<code>webhook.teste</code>) é sempre incluído.</p>
            </div>
          </Section>
        </div>
      </div>
      <details className="mt-7 border-t border-border pt-5"><summary className="cursor-pointer text-sm font-medium">Exemplo do envio</summary><div className="mt-3"><WebhookCurlExample url={form.url} type={exampleType} environment={environment} organization_id={org} integration_id={integration} auth_header={(form.auth_value || (form.auth_configured && !form.auth_clear)) ? (form.auth_header.trim() || 'Authorization') : null} /></div></details>
    </div>
    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>Salvar</Button></div>
  </form>
}

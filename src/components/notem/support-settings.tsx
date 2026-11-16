import { useState } from 'react';
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupportSettings, updateSupportSettings, WHATSAPP_PATTERN } from '@/lib/platform-settings.functions';

export const supportSettingsQuery = () => queryOptions({ queryKey: ['support-settings'], queryFn: () => getSupportSettings() });
export function SupportSettings() {
  const { data } = useSuspenseQuery(supportSettingsQuery()); const cache = useQueryClient(); const save = useServerFn(updateSupportSettings);
  const [email, setEmail] = useState(data.ok ? data.contact.email ?? '' : ''), [whatsapp, setWhatsapp] = useState(data.ok ? data.contact.whatsapp ?? '' : ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!data.ok) return <><h1 className="page-heading mb-8">Suporte</h1><p role="alert" className="text-destructive">{data.mensagem}</p></>;
  const waInvalid = whatsapp !== '' && !WHATSAPP_PATTERN.test(whatsapp);
  return <><h1 className="page-heading">Suporte</h1><p className="mb-8 mt-2 text-sm text-muted-foreground">Contato exibido na Ajuda de todas as organizações. Deixe vazio para não mostrar.</p>
    <form className="max-w-lg space-y-6" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { const r = await save({ data: { email: email.trim(), whatsapp: whatsapp.trim() } }); if (!r.ok) setError(r.mensagem); else { await Promise.all([cache.invalidateQueries({ queryKey: ['support-settings'] }), cache.invalidateQueries({ queryKey: ['support-contact'] })]); toast.success('Contato de suporte atualizado.'); } } catch { setError('Confira o e-mail e o WhatsApp (só números, com 55 e o DDD).'); } finally { setBusy(false); } }}>
      <div className="form-field"><label htmlFor="support-email">E-mail</label><Input id="support-email" type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="support-whatsapp">WhatsApp</label><Input id="support-whatsapp" inputMode="numeric" placeholder="5548999990000" value={whatsapp} onChange={e => setWhatsapp(e.target.value.replace(/\D/g, ''))} aria-invalid={waInvalid} /><p className="mt-2 text-xs text-muted-foreground">Só números, com 55 e o DDD.</p>{waInvalid && <p className="mt-1 text-xs text-destructive">WhatsApp inválido.</p>}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy || waInvalid}><Save />Salvar</Button></form></>;
}

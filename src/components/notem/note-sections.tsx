import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getPanelInvoicePdf } from '@/lib/invoices.functions';
import { deliverFile } from '@/lib/file-download';
import { addressLines, takerMunicipalityCode, takerRows, valueRows } from '@/lib/note-display';
import type { Env } from '@/lib/api-contract';
import { useMunicipalityName } from './actor-names';

/** Valores: the same labels for notes issued by notem and outside it. */
export function ValuesSection({ valores }: { valores: Record<string, unknown> }) {
  return <section className="border-t border-border pt-5"><h2 className="mb-4 text-lg font-medium">Valores</h2><dl className="space-y-3 text-sm">{valueRows(valores).map(([k, v]) => <div key={k} className="flex justify-between gap-5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl></section>;
}
/** Tomador: type in words, CPF/CNPJ with mask and the address in lines. */
export function TakerDetails({ taker }: { taker: unknown }) {
  const municipality = useMunicipalityName(takerMunicipalityCode(taker));
  const address = addressLines(taker && typeof taker === 'object' ? (taker as Record<string, unknown>)['endereco'] : null, municipality);
  return <dl className="grid gap-4 text-sm sm:grid-cols-2">{takerRows(taker).map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 break-words">{v}</dd></div>)}{address.length > 0 && <div className="sm:col-span-2"><dt className="text-muted-foreground">Endereço</dt><dd className="mt-1">{address.map(l => <span key={l} className="block">{l}</span>)}</dd></div>}</dl>;
}
export function TakerSection({ taker }: { taker: unknown }) {
  return <section className="border-t border-border pt-5"><h2 className="mb-4 text-lg font-medium">Tomador</h2>{taker && typeof taker === 'object' ? <TakerDetails taker={taker} /> : <p className="text-sm text-muted-foreground">Tomador não informado.</p>}</section>;
}
/** "Baixar PDF" delivers the DANFSe on the first click. */
export function PdfButton({ organizationId, environment, id, companyId, variant = 'outline' }: { organizationId: string; environment: Env; id: string; companyId?: string; variant?: 'outline' | 'default' }) {
  const get = useServerFn(getPanelInvoicePdf); const [busy, setBusy] = useState(false);
  return <Button variant={variant} disabled={busy} onClick={async () => { setBusy(true); try { const r = await get({ data: { organization_id: organizationId, environment, id, ...(companyId ? { company_id: companyId } : {}) } }); await deliverFile(new Blob([Uint8Array.from(atob(r.base64), c => c.charCodeAt(0))], { type: 'application/pdf' }), r.filename); } catch { toast.error('Não foi possível preparar o PDF. Tente novamente.'); } finally { setBusy(false); } }}><Download />{busy ? 'Preparando PDF…' : 'Baixar PDF'}</Button>;
}
export function saveXml(xml: string, name: string) { void deliverFile(new Blob([xml], { type: 'application/xml;charset=utf-8' }), name); }

import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Download, FileArchive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { exportInvoicesCsv, finishZipExport, getExportFiles, startZipExport, ZIP_BATCH, ZIP_LIMIT } from '@/lib/notes-export.functions';
import { downloadBlob } from '@/lib/file-download';
import type { NoteFilters } from '@/lib/note-filters';

type Scope = { organization_id: string; environment: 'sandbox' | 'production' };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const errorText = (e: unknown, fallback: string) => e instanceof Error && e.message && !/^[A-Z_]+$/.test(e.message) ? e.message : fallback;

export function NotesExport({ scope, filters, total }: { scope: Scope; filters: NoteFilters; total: number }) {
  const csv = useServerFn(exportInvoicesCsv), start = useServerFn(startZipExport), files = useServerFn(getExportFiles), finish = useServerFn(finishZipExport);
  const [csvBusy, setCsvBusy] = useState(false), [open, setOpen] = useState(false), [kinds, setKinds] = useState({ xml: true, pdf: true });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null), [error, setError] = useState(''); const cancel = useRef(false);
  async function runCsv() {
    setCsvBusy(true);
    try { const r = await csv({ data: { ...scope, filters } }); if (!r.ok) toast.error(r.mensagem); else { downloadBlob(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }), r.filename); toast.success(`${r.count} notas exportadas.`); } }
    catch (e) { toast.error(errorText(e, 'Não foi possível exportar a planilha. Tente novamente.')); } finally { setCsvBusy(false); }
  }
  async function runZip() {
    setError(''); cancel.current = false;
    let s: Awaited<ReturnType<typeof start>>; try { s = await start({ data: { ...scope, filters, kinds } }); } catch (e) { setError(errorText(e, 'Não foi possível começar a exportação.')); return; }
    if (!s.ok) { setError(s.mensagem); return; }
    const { zipSync, strToU8 } = await import('fflate'); const out: Record<string, Uint8Array> = {}; let without = 0, count = 0, done = 0; let outcome: 'concluida' | 'interrompida' = 'interrompida';
    setProgress({ done: 0, total: s.ids.length });
    try {
      for (let i = 0; i < s.ids.length; i += ZIP_BATCH) {
        if (cancel.current) throw new Error('Exportação cancelada.');
        const ids = s.ids.slice(i, i + ZIP_BATCH); let r: Awaited<ReturnType<typeof files>> | null = null;
        for (let attempt = 0; attempt < 6 && !r?.ok; attempt++) { r = await files({ data: { organization_id: scope.organization_id, export_id: s.export_id, ids } }); if (!r.ok && r.retry) await wait(5_000 * (attempt + 1)); else if (!r.ok) break; }
        if (!r?.ok) throw new Error(r?.mensagem ?? 'Não foi possível preparar os arquivos.');
        for (const f of r.files) { out[f.path] = f.base64 ? b64(f.base64) : strToU8(f.text ?? ''); count++; }
        without += r.missing.length; done += ids.length; setProgress({ done, total: s.ids.length });
      }
      if (!count) throw new Error('Nenhuma nota do filtro tem arquivo oficial para baixar.');
      downloadBlob(new Blob([zipSync(out, { level: 6 }) as BlobPart], { type: 'application/zip' }), s.filename); outcome = 'concluida';
      toast.success(without ? `ZIP gerado. ${without} nota(s) sem arquivo oficial ficaram de fora.` : 'ZIP gerado.'); setOpen(false);
    } catch (e) { setError(errorText(e, 'A exportação foi interrompida. Tente novamente.')); }
    finally { setProgress(null); try { await finish({ data: { organization_id: scope.organization_id, export_id: s.export_id, outcome, files: count, notes: done, without_file: without } }); } catch { /* audit end best effort; start already recorded */ } }
  }
  const busy = progress !== null;
  return <div className="flex flex-wrap gap-2">
    <Button variant="outline" size="sm" onClick={runCsv} disabled={csvBusy || !total}>{csvBusy ? <Loader2 className="animate-spin" /> : <Download />}Exportar planilha</Button>
    <Button variant="outline" size="sm" onClick={() => { setError(''); setOpen(true); }} disabled={!total}><FileArchive />Baixar XML/PDF</Button>
    <Dialog open={open} onOpenChange={o => { if (!busy) setOpen(o); }}><DialogContent><DialogHeader><DialogTitle>Baixar arquivos das notas</DialogTitle><DialogDescription>{total.toLocaleString('pt-BR')} nota(s) no filtro atual. Limite de {ZIP_LIMIT} por arquivo ZIP; cada empresa ganha uma pasta. Notas canceladas incluem o XML do cancelamento.</DialogDescription></DialogHeader>
      <div className="space-y-3"><label className="flex items-center gap-3 text-sm"><Checkbox checked={kinds.xml} onCheckedChange={v => setKinds(k => ({ ...k, xml: v === true }))} disabled={busy} />XML oficial</label><label className="flex items-center gap-3 text-sm"><Checkbox checked={kinds.pdf} onCheckedChange={v => setKinds(k => ({ ...k, pdf: v === true }))} disabled={busy} />PDF (DANFSe)</label></div>
      {progress && <div className="space-y-2"><Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} /><p className="text-xs text-muted-foreground">{progress.done} de {progress.total} notas preparadas. Mantenha esta janela aberta.</p></div>}
      {total > ZIP_LIMIT && <p className="text-sm text-destructive">O filtro passa de {ZIP_LIMIT} notas. Reduza o período.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>{busy ? <Button variant="outline" onClick={() => { cancel.current = true; }}>Cancelar</Button> : <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>}<Button onClick={runZip} disabled={busy || (!kinds.xml && !kinds.pdf) || total > ZIP_LIMIT}>{busy ? <Loader2 className="animate-spin" /> : <FileArchive />}Gerar ZIP</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

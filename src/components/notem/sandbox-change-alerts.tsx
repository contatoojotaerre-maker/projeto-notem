import { dateTimeBr } from '@/lib/br-format';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { acknowledgeSandboxChanges } from '@/lib/notem.functions';
import { sandboxChangesQuery } from '@/lib/notem.queries';
import { sandboxChangeMessage, type SandboxAction, type SandboxItem } from '@/lib/api-policy';

/** Registration changed through a sandbox key also affects production: every organization page shows it until acknowledged. */
export function SandboxChangeAlerts({ organizationId }: { organizationId: string }) {
  const { data } = useQuery(sandboxChangesQuery(organizationId)); const cache = useQueryClient();
  const ack = useServerFn(acknowledgeSandboxChanges); const [busy, setBusy] = useState(false);
  if (!data?.rows.length) return null;
  async function acknowledge() {
    setBusy(true);
    try { await ack({ data: { organization_id: organizationId, ids: data!.rows.map(r => r.id) } }); await cache.invalidateQueries({ queryKey: ['sandbox-changes', organizationId] }); toast.success('Avisos marcados como lidos.'); }
    catch { toast.error('Não foi possível marcar os avisos como lidos.'); } finally { setBusy(false); }
  }
  return <Alert className="mb-6 border-primary/40">
    <FlaskConical className="h-4 w-4" />
    <AlertTitle>Cadastro alterado pela chave de homologação</AlertTitle>
    <AlertDescription>
      <p className="text-muted-foreground">Empresa, configuração fiscal, serviços, tomadores e certificado são os mesmos em homologação e produção.</p>
      <ul className="mt-2 space-y-1">{data.rows.slice(0, 5).map(r => <li key={r.id}>{sandboxChangeMessage(r.item as SandboxItem, r.action as SandboxAction, r.integration)}{r.company ? ` · ${r.company}` : ''} · {dateTimeBr(r.created_at)}</li>)}</ul>
      {data.rows.length > 5 && <p className="mt-1 text-muted-foreground">e mais {data.rows.length - 5} alteração(ões).</p>}
      {data.canAcknowledge && <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={acknowledge}>{busy && <Loader2 className="animate-spin" />}Marcar como lido</Button>}
    </AlertDescription>
  </Alert>;
}

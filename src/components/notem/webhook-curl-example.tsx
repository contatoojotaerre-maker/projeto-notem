import { useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { webhookCurl, type CurlShell, webhookTypes } from '@/lib/webhooks'

type Props = { url: string; type: typeof webhookTypes[number]; environment: 'sandbox' | 'production'; organization_id: string; integration_id: string; auth_header?: string | null }

export function WebhookCurlExample(props: Props) {
  const [shell, setShell] = useState<CurlShell>('bash')
  const text = webhookCurl(shell, props)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Formato do exemplo">
          <Button type="button" size="sm" variant={shell === 'bash' ? 'secondary' : 'ghost'} onClick={() => setShell('bash')}>curl (Linux/macOS)</Button>
          <Button type="button" size="sm" variant={shell === 'powershell' ? 'secondary' : 'ghost'} onClick={() => setShell('powershell')}>PowerShell (curl.exe)</Button>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); toast.success('Copiado.') } catch { toast.error('Não foi possível copiar.') } }}><Copy />Copiar</Button>
      </div>
      <pre className="bg-muted p-4 overflow-auto max-h-72 text-xs"><code>{text}</code></pre>
      <p className="text-xs text-muted-foreground">A assinatura é ilustrativa e a chave de autorização aparece mascarada. Eventos ainda sem dados definidos são enviados com "dados": {'{}'}; os exemplos completos dos eventos de nota virão com o contrato de emissão.</p>
    </div>
  )
}

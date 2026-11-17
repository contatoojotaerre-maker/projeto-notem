import { Check, Circle } from 'lucide-react';
import { passwordChecklist } from '@/lib/password-rule';
// Live checklist of the single password rule; each item is marked as soon as it is met while the person types.
export function PasswordRequirements({ password, confirm, id }: { password: string; confirm: string; id: string }) {
  const items = passwordChecklist(password);
  const matches = confirm.length > 0 && confirm === password;
  return <div id={id} className="space-y-1.5 text-xs" aria-live="polite">
    <p className="text-muted-foreground">A senha precisa ter:</p>
    <ul className="space-y-1">{items.map(i => <Item key={i.id} ok={i.ok} label={i.label} />)}</ul>
    {confirm.length > 0 && !matches ? <p className="text-destructive">As senhas não conferem.</p> : null}
  </div>;
}
function Item({ ok, label }: { ok: boolean; label: string }) {
  return <li className={`flex items-center gap-2 ${ok ? 'text-foreground' : 'text-muted-foreground'}`} data-ok={ok}>
    {ok ? <Check className="size-3.5 text-success" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
    <span>{label}</span><span className="sr-only">{ok ? ' (cumprido)' : ' (pendente)'}</span>
  </li>;
}

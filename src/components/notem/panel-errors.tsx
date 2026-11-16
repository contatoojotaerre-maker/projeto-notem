import { Link, useRouter, useRouterState, type ErrorComponentProps } from '@tanstack/react-router';
import { FileQuestion, Lock, TriangleAlert, Home, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { isAccessDenied } from '@/lib/panel-errors';
import { reportLovableError } from '@/lib/lovable-error-reporting';
import { useOptionalWorkspace } from './app-shell';

/** Início of the organization in the address (when it is one of the user's), else the last used one. */
function useHomeTarget() {
  const w = useOptionalWorkspace(); const path = useRouterState({ select: s => s.location.pathname });
  const parts = path.split('/'); const slug = parts[1] === 'o' ? parts[2] : undefined;
  const org = w?.organizations.find(o => o.slug === slug) ?? w?.organizations.find(o => o.id === w?.profile?.last_organization_id) ?? w?.organizations[0];
  return org ? { to: '/o/$orgSlug/$section' as const, params: { orgSlug: org.slug, section: 'inicio' } } : null;
}
function HomeButton({ primary = true }: { primary?: boolean }) {
  const t = useHomeTarget();
  return <Button asChild variant={primary ? 'default' : 'outline'}>{t ? <Link to={t.to} params={t.params}><Home />Voltar ao Início</Link> : <Link to="/dashboard"><Home />Voltar ao Início</Link>}</Button>;
}
function Panel({ icon, title, text, children }: { icon: React.ReactNode; title: string; text?: string; children: React.ReactNode }) {
  return <div className="empty-state" role="alert">{icon}<h1 className="text-xl font-medium">{title}</h1>{text && <p className="max-w-md text-sm text-muted-foreground">{text}</p>}<div className="mt-2 flex flex-wrap justify-center gap-3">{children}</div></div>;
}
export function PanelNotFound() {
  return <Panel icon={<FileQuestion size={36} strokeWidth={1} className="text-muted-foreground" />} title="Página não encontrada"><HomeButton /></Panel>;
}
export function PanelForbidden() {
  return <Panel icon={<Lock size={36} strokeWidth={1} className="text-muted-foreground" />} title="Você não tem acesso a esta página." text="Fale com o proprietário ou administrador da organização."><HomeButton /></Panel>;
}
/** Unexpected failure: never shows internal text, stack traces or library messages. */
export function PanelError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => { if (!isAccessDenied(error)) reportLovableError(error, { boundary: 'panel_error_component' }); }, [error]);
  if (isAccessDenied(error)) return <PanelForbidden />;
  return <Panel icon={<TriangleAlert size={36} strokeWidth={1} className="text-muted-foreground" />} title="Não foi possível carregar esta página."><Button onClick={() => { void router.invalidate(); reset(); }}><RotateCcw />Tentar de novo</Button><HomeButton primary={false} /></Panel>;
}

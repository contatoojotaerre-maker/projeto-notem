import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Mail, MessageCircle } from 'lucide-react';
import { supportContactQuery } from '@/lib/panel-home.queries';

/** Public API documentation lives at docs.notemfiscal.com.br from Fase 10; until then the block stays hidden. */
export const API_DOCS_URL: string | null = null;
type Step = { title: string; text: string; to: 'companies' | 'notes' | 'integrations' | 'newCompany' };
const steps: Step[] = [
  { title: 'Cadastrar empresa', text: 'Em Empresas, use "Nova empresa" e informe CNPJ, razão social e endereço.', to: 'newCompany' },
  { title: 'Enviar certificado', text: 'Na empresa, aba Certificado: envie o arquivo A1 (.pfx) e a senha.', to: 'companies' },
  { title: 'Configurar a parte fiscal', text: 'Na aba Configuração fiscal, responda às perguntas sobre regime e tributos.', to: 'companies' },
  { title: 'Configurar serviço', text: 'Na aba Serviços, cadastre o serviço e use "Aplicar sugestão" para preencher a classificação IBS/CBS.', to: 'companies' },
  { title: 'Sincronizar notas', text: 'Na aba Sincronização, escolha o período para trazer as notas emitidas fora da notem.', to: 'companies' },
  { title: 'Cancelar nota', text: 'Em Notas, abra a nota autorizada e use "Cancelar nota", com motivo e justificativa.', to: 'notes' },
  { title: 'Criar integração e chave de API', text: 'Em Integrações, crie a integração e gere a chave do ambiente (ela aparece uma única vez).', to: 'integrations' },
  { title: 'Cadastrar webhook', text: 'Na integração, aba Webhooks, informe o endereço HTTPS e os eventos.', to: 'integrations' },
];
const whatsappLabel = (n: string) => `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, -4)}-${n.slice(-4)}`;
function StepLink({ slug, to }: { slug: string; to: Step['to'] }) {
  const cls = 'text-sm underline underline-offset-4';
  if (to === 'newCompany') return <Link className={cls} to="/o/$orgSlug/empresas/nova" params={{ orgSlug: slug }}>Abrir</Link>;
  if (to === 'companies') return <Link className={cls} to="/o/$orgSlug/empresas" params={{ orgSlug: slug }}>Abrir Empresas</Link>;
  if (to === 'integrations') return <Link className={cls} to="/o/$orgSlug/integracoes" params={{ orgSlug: slug }}>Abrir Integrações</Link>;
  return <Link className={cls} to="/o/$orgSlug/$section" params={{ orgSlug: slug, section: 'notas' }}>Abrir Notas</Link>;
}
export function HelpView({ slug }: { slug: string }) {
  const { data: contact } = useSuspenseQuery(supportContactQuery());
  return <><h1 className="page-heading mb-8">Ajuda</h1>
    <section><h2 className="mb-4 text-lg font-medium">Passo a passo</h2><ol className="divide-y divide-border border-y border-border">{steps.map((s, i) => <li key={s.title} className="flex flex-wrap items-start justify-between gap-4 py-4"><div className="flex-1"><p className="font-medium">{i + 1}. {s.title}</p><p className="mt-1 text-sm text-muted-foreground">{s.text}</p></div><StepLink slug={slug} to={s.to} /></li>)}</ol></section>
    {API_DOCS_URL && <section className="mt-10"><h2 className="mb-3 text-lg font-medium">Documentação da API</h2><a className="underline underline-offset-4" href={API_DOCS_URL} target="_blank" rel="noreferrer">{API_DOCS_URL}</a></section>}
    {(contact.email || contact.whatsapp) && <section className="mt-10"><h2 className="mb-3 text-lg font-medium">Suporte</h2><div className="flex flex-wrap gap-6 text-sm">{contact.email && <a className="inline-flex items-center gap-2 underline underline-offset-4" href={`mailto:${contact.email}`}><Mail size={16} />{contact.email}</a>}{contact.whatsapp && <a className="inline-flex items-center gap-2 underline underline-offset-4" href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />{whatsappLabel(contact.whatsapp)}</a>}</div></section>}</>;
}

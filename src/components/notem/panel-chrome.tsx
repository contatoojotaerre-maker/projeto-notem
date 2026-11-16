// Small shared pieces of the panel pages: the clickable path (single "voltar"), the shared-registry notice
// and the environment wording used by confirmations.
import { Fragment, type ReactNode } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { SHARED_REGISTRY_NOTICE } from '@/lib/panel-nav';

/** "Empresas › Group Jota": every item but the last is a link. */
export function Trail({ items }: { items: ReactNode[] }) {
  return <nav aria-label="Caminho" className="breadcrumb-trail">{items.map((item, i) => <Fragment key={i}>{i > 0 && <ChevronRight size={13} aria-hidden="true" />}{i === items.length - 1 ? <span aria-current="page" className="text-foreground">{item}</span> : item}</Fragment>)}</nav>;
}
/** Shown on Cadastro, Configuração fiscal, Serviços, Certificado, Tomadores and Organização. */
export function SharedRegistryNotice() {
  return <p className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"><Info size={14} aria-hidden="true" />{SHARED_REGISTRY_NOTICE}</p>;
}
/** Bold environment name used in confirmations ("Gerar chave de **produção**?"). */
export function EnvName({ environment }: { environment: string }) { return <strong>{environment === 'sandbox' ? 'homologação' : 'produção'}</strong>; }

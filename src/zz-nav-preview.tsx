// TEMPORARY visual check of the collapsible menu groups (deleted after the screenshot).
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { FileText, Settings, Home } from 'lucide-react';
import { NavGroup, useNavGroups } from '@/components/notem/nav-group';
import { currentNavGroup, navSubitemActive } from '@/lib/nav-groups';
import '@/styles.css';
function Demo({ iconOnly }: { iconOnly: boolean }) {
  const [path] = useState('/o/x/notas/recebidas/abc'); const g = useNavGroups(currentNavGroup(path), path); const sub = navSubitemActive(path, '');
  const l = (k: string, label: string, a: boolean) => ({ key: k, label, active: a, render: ({ children, onClick, ...p }: any) => <a href="#" {...p} onClick={(e) => { e.preventDefault(); onClick(); }}>{children}</a> });
  return <div className={iconOnly ? 'app-collapsed' : ''}><aside className="app-sidebar" style={{ position: 'relative', height: 420, padding: 12 }}><nav className="space-y-1">
    <a className="nav-item" href="#"><Home size={18} /><span className="sidebar-label">Início</span></a>
    <NavGroup id="notas" label="Notas" icon={FileText} open={g.isOpen('notas')} onToggle={() => g.toggle('notas')} iconOnly={iconOnly} onNavigate={() => {}} items={[l('e', 'Emitidas', sub.emitidas), l('r', 'Recebidas', sub.recebidas)]} />
    <NavGroup id="organizacao" label="Organização" icon={Settings} open={g.isOpen('organizacao')} onToggle={() => g.toggle('organizacao')} iconOnly={iconOnly} onNavigate={() => {}} items={[l('d', 'Dados', sub.dados), l('q', 'Equipe', sub.equipe)]} />
  </nav></aside></div>;
}
export function mount(el: HTMLElement, iconOnly: boolean) { document.documentElement.dataset['theme'] = 'dark'; createRoot(el).render(<Demo iconOnly={iconOnly} />); }

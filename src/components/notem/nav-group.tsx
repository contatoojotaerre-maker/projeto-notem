import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { readNavGroupState, withCurrentOpen, writeNavGroupState, type NavGroupId, type NavGroupState } from '@/lib/nav-groups';

function browserStorage() { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } }

/** Open/closed state of the menu groups: remembered in this browser; the group of the current screen opens on
 *  every navigation into it (`locationKey` = path + search). The panel renders client-only, so reading storage
 *  in the initializer cannot mismatch a server render and avoids an opening animation on load. */
export function useNavGroups(current: NavGroupId | null, locationKey: string) {
  const [state, setState] = useState<NavGroupState>(() => withCurrentOpen(readNavGroupState(browserStorage()), current));
  useEffect(() => { setState(s => withCurrentOpen(s, current)); }, [current, locationKey]);
  useEffect(() => { writeNavGroupState(browserStorage(), state); }, [state]);
  return { isOpen: (id: NavGroupId) => state[id], toggle: (id: NavGroupId) => setState(s => ({ ...s, [id]: !s[id] })) };
}

export type NavGroupItem = { key: string; label: string; active: boolean; render: (p: { className: string; 'data-active': boolean; tabIndex?: number; onClick: () => void; children: ReactNode }) => ReactNode };

/** Menu item with sub-items. Expanded menu: a button (aria-expanded) that opens/closes the group; it never navigates.
 *  Icon-only menu: the icon opens a floating menu beside it, closed on choice, outside click or Esc. */
export function NavGroup({ id, label, icon: Icon, items, open, onToggle, iconOnly, onNavigate }: { id: NavGroupId; label: string; icon: LucideIcon; items: NavGroupItem[]; open: boolean; onToggle: () => void; iconOnly: boolean; onNavigate: () => void }) {
  const panelId = `${useId()}-${id}`; const [flyout, setFlyout] = useState(false);
  const active = items.some(i => i.active);
  if (iconOnly) return <Popover open={flyout} onOpenChange={setFlyout}>
    <PopoverTrigger asChild><button type="button" className="nav-item" title={label} aria-label={label} data-parent-active={active}><Icon size={18} aria-hidden /></button></PopoverTrigger>
    <PopoverContent side="right" align="start" sideOffset={10} className="nav-flyout w-48 p-1.5" aria-label={label}>
      <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      {items.map(i => <div key={i.key}>{i.render({ className: 'nav-item nav-flyout-item', 'data-active': i.active, onClick: () => { setFlyout(false); onNavigate(); }, children: i.label })}</div>)}
    </PopoverContent>
  </Popover>;
  return <div className="nav-group" data-open={open}>
    <button type="button" className="nav-item" title={label} aria-expanded={open} aria-controls={panelId} data-parent-active={active} onClick={onToggle}>
      <Icon size={18} aria-hidden /><span className="sidebar-label">{label}</span><ChevronRight size={15} aria-hidden className="nav-group-chevron sidebar-label" />
    </button>
    <div id={panelId} className="nav-group-panel" inert={!open}><div className="nav-group-inner space-y-1 pt-1">
      {items.map(i => <div key={i.key}>{i.render({ className: 'nav-item nav-subitem', 'data-active': i.active, ...(open ? {} : { tabIndex: -1 }), onClick: onNavigate, children: <span className="sidebar-label">{i.label}</span> })}</div>)}
    </div></div>
  </div>;
}

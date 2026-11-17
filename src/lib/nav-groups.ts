import { organizationTab } from './panel-tabs';

// Collapsible menu groups (Notas › Emitidas/Recebidas, Organização › Dados/Equipe): which group the current
// screen belongs to and the open/closed state remembered in this browser. Pure, so the shell and tests share it.
export const NAV_GROUP_IDS = ['notas', 'organizacao'] as const;
export type NavGroupId = typeof NAV_GROUP_IDS[number];
export type NavGroupState = Record<NavGroupId, boolean>;
export const NAV_GROUPS_KEY = 'notem-menu-grupos';
/** Default: every group closed (the group of the current screen is opened on top of this). */
export const CLOSED_GROUPS: NavGroupState = { notas: false, organizacao: false };

/** Group of the screen at `pathname` inside /o/{org}/…, or null (Início, Empresas, Alertas, Integrações, other pages). */
export function currentNavGroup(pathname: string): NavGroupId | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'o' || !parts[1]) return null;
  if (parts[2] === 'notas') return 'notas';
  if (parts[2] === 'organizacao' || parts[2] === 'equipe') return 'organizacao';
  return null;
}

/** Stored text → state; anything unreadable falls back to closed groups. */
export function parseNavGroupState(raw: string | null | undefined): NavGroupState {
  if (!raw) return { ...CLOSED_GROUPS };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return { ...CLOSED_GROUPS };
    const v = value as Record<string, unknown>;
    return { notas: v['notas'] === true, organizacao: v['organizacao'] === true };
  } catch { return { ...CLOSED_GROUPS }; }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
/** Reads the remembered state; a storage failure (blocked, private mode) never breaks the menu. */
export function readNavGroupState(storage: StorageLike | null | undefined): NavGroupState {
  try { return parseNavGroupState(storage?.getItem(NAV_GROUPS_KEY)); } catch { return { ...CLOSED_GROUPS }; }
}
export function writeNavGroupState(storage: StorageLike | null | undefined, state: NavGroupState) {
  try { storage?.setItem(NAV_GROUPS_KEY, JSON.stringify({ notas: state.notas, organizacao: state.organizacao })); } catch { /* storage unavailable: state lives only in this tab */ }
}
/** Entering a screen of a group opens that group; the others stay as the person left them. */
export function withCurrentOpen(state: NavGroupState, current: NavGroupId | null): NavGroupState {
  return current && !state[current] ? { ...state, [current]: true } : state;
}

/** Highlighted sub-item for the screen at pathname + search (detail screens highlight their list). */
export function navSubitemActive(pathname: string, search: string) {
  const group = currentNavGroup(pathname), parts = pathname.split('/').filter(Boolean);
  const received = group === 'notas' && parts[3] === 'recebidas';
  const team = group === 'organizacao' && (parts[2] === 'equipe' || organizationTab(new URLSearchParams(search).get('aba')) === 'equipe');
  return { emitidas: group === 'notas' && !received, recebidas: received, dados: group === 'organizacao' && !team, equipe: team };
}

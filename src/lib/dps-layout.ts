// DPS layout profiles. One builder (dps.ts) emits every profile; the differences live only here.
// nt004 = layout of the XSD of 09/02/2026; nt009r1 = NT 009 release 1 (restricted production since 20/10/2026).
export type DpsLayout = 'nt004' | 'nt009r1';
export const DPS_LAYOUTS: Record<DpsLayout, { label: string; finNFSe: boolean; cServOrder: readonly string[] }> = {
  nt004: { label: 'Leiaute atual (XSD de 09/02/2026)', finNFSe: false, cServOrder: ['cTribNac', 'cTribMun', 'xDescServ', 'cNBS', 'cIntContrib'] },
  nt009r1: { label: 'NT 009 (release 1)', finNFSe: true, cServOrder: ['cTribNac', 'cTribMun', 'cNBS', 'cIntContrib', 'xDescServ'] },
};
/** Default production start of NT 009 release 1: 01/12/2026 00:00 in Brasília (UTC-3). */
export const DEFAULT_NT009R1_PRODUCTION_START = '2026-12-01T03:00:00.000Z';
/** finNFSe sent by notem: 0 = regular NFS-e (credit/debit notes are not issued). */
export const REGULAR_FIN_NFSE = '0';

/**
 * Layout in force at a given moment. Sandbox (restricted production) always validates NT 009;
 * production switches at the configured start (an unreadable value falls back to the default date).
 */
export function chooseDpsLayout(environment: 'sandbox' | 'production', now: Date | number, productionStart?: string | null): DpsLayout {
  if (environment === 'sandbox') return 'nt009r1';
  const parsed = Date.parse(productionStart ?? '');
  const start = Number.isFinite(parsed) ? parsed : Date.parse(DEFAULT_NT009R1_PRODUCTION_START);
  return (typeof now === 'number' ? now : now.getTime()) >= start ? 'nt009r1' : 'nt004';
}

const header = (xml: string) => { const a = xml.indexOf('<tpEmit>'), b = xml.indexOf('<cLocEmi>'); if (a < 0 || b < a) throw new Error('DPS_BASE_INVALIDA'); return [a, b] as const; };
/** Layout of a DPS built by notem: finNFSe inside the infDPS header (between tpEmit and cLocEmi) only exists in NT 009. */
export function detectDpsLayout(xml: string): DpsLayout { const [a, b] = header(xml); return xml.slice(a, b).includes('<finNFSe>') ? 'nt009r1' : 'nt004'; }

/** Children of cServ in the order required by the layout (every child is a text element; values are already escaped). */
export function orderCServ(children: Record<string, string>, layout: DpsLayout) {
  return DPS_LAYOUTS[layout].cServOrder.map(n => children[n] ?? '').join('');
}

/**
 * Same DPS (same number, values and texts) in another layout. Used only when a DPS built before the switch is
 * sent after it, on paths that already allow sending. Tests prove it equals buildDps(input, target).
 */
export function convertDpsLayout(xml: string, target: DpsLayout): string {
  const source = detectDpsLayout(xml); if (source === target) return xml;
  let out = xml;
  if (DPS_LAYOUTS[target].finNFSe) {
    const [, b] = header(out); const rej = out.indexOf('<chNFSeRej>'); const at = rej >= 0 && rej < b ? rej : b;
    out = out.slice(0, at) + `<finNFSe>${REGULAR_FIN_NFSE}</finNFSe>` + out.slice(at);
  } else {
    const removed = out.replace(`<finNFSe>${REGULAR_FIN_NFSE}</finNFSe>`, '');
    if (removed === out || /<finNFSe>/.test(removed.slice(...header(removed)))) throw new Error('DPS_FINALIDADE_NAO_CONVERSIVEL');
    out = removed;
  }
  const m = out.match(/<cServ>((?:<(\w+)>[^<]*<\/\2>)+)<\/cServ>/); if (!m) throw new Error('DPS_BASE_INVALIDA');
  const children: Record<string, string> = {}; for (const c of m[1]!.matchAll(/<(\w+)>[^<]*<\/\1>/g)) { if (!DPS_LAYOUTS[target].cServOrder.includes(c[1]!) || children[c[1]!]) throw new Error('DPS_BASE_INVALIDA'); children[c[1]!] = c[0]; }
  out = out.replace(m[0], `<cServ>${orderCServ(children, target)}</cServ>`);
  if (detectDpsLayout(out) !== target) throw new Error('DPS_BASE_INVALIDA');
  return out;
}

// DPS layout profiles. One builder (dps.ts) emits every profile; the differences live only here.
// nt004 = layout of the XSD of 09/02/2026; nt009r1 = NT 009 release 1 (restricted production since 20/10/2026);
// nt009r2 = next NT 009 release (Anexo VI v1.04.01: regApIBSCBSSN, cAtvSN, indDest at the root). nt009r2 is off until an
// admin sets its start per environment; it has no official XSD yet, so it is tested by the Anexo VI structure.
export type DpsLayout = 'nt004' | 'nt009r1' | 'nt009r2';
export type LayoutProfile = { label: string; finNFSe: boolean; alphanumericCnpj: boolean; ibsCbs: boolean; destAtRoot: boolean; simplesIbsCbs: boolean; cServOrder: readonly string[] };
export const DPS_LAYOUTS: Record<DpsLayout, LayoutProfile> = {
  nt004: { label: 'Leiaute atual (XSD de 09/02/2026)', finNFSe: false, alphanumericCnpj: false, ibsCbs: false, destAtRoot: false, simplesIbsCbs: false, cServOrder: ['cTribNac', 'cTribMun', 'xDescServ', 'cNBS', 'cIntContrib'] },
  nt009r1: { label: 'NT 009 (release 1)', finNFSe: true, alphanumericCnpj: true, ibsCbs: true, destAtRoot: false, simplesIbsCbs: false, cServOrder: ['cTribNac', 'cTribMun', 'cNBS', 'cIntContrib', 'xDescServ'] },
  nt009r2: { label: 'NT 009 (próximo release — Anexo VI v1.04.01)', finNFSe: true, alphanumericCnpj: true, ibsCbs: true, destAtRoot: true, simplesIbsCbs: true, cServOrder: ['cTribNac', 'cTribMun', 'cNBS', 'cAtvSN', 'cIntContrib', 'xDescServ'] },
};
export const LAYOUT_NOT_CONVERTIBLE = 'DPS_LEIAUTE_NAO_CONVERSIVEL';
export const IBSCBS_OLD_LAYOUT_ERROR = 'DPS_IBSCBS_LEIAUTE_ANTERIOR';
/** Default production start of NT 009 release 1: 01/12/2026 00:00 in Brasília (UTC-3). */
export const DEFAULT_NT009R1_PRODUCTION_START = '2026-12-01T03:00:00.000Z';
/** The previous XSD only accepts numeric CNPJ, key and Ids: the API appends the configured start date to this message. */
export const ALPHANUMERIC_CNPJ_LAYOUT_MESSAGE = 'CNPJ alfanumérico só pode ser usado em produção a partir da vigência da NT 009';
export const ALPHANUMERIC_CNPJ_CONVERSION_ERROR = 'DPS_CNPJ_ALFANUMERICO_LEIAUTE_ANTERIOR';
/** True when the DPS carries letters in its Id or in any CNPJ / replaced key (only the NT 009 layout accepts them). */
export function dpsHasAlphanumericCnpj(xml: string) { return /Id="DPS[^"]*[A-Z][^"]*"/.test(xml) || /<(CNPJ|chSubstda)>[^<]*[A-Z][^<]*<\//.test(xml); }
/** finNFSe sent by notem: 0 = regular NFS-e (credit/debit notes are not issued). */
export const REGULAR_FIN_NFSE = '0';

/**
 * Layout in force at a given moment. Sandbox (restricted production) always validates NT 009;
 * production switches at the configured start (an unreadable value falls back to the default date).
 */
export function chooseDpsLayout(environment: 'sandbox' | 'production', now: Date | number, productionStart?: string | null, r2Start?: string | null): DpsLayout {
  const at = typeof now === 'number' ? now : now.getTime();
  const r2 = Date.parse(r2Start ?? ''); if (Number.isFinite(r2) && at >= r2) return 'nt009r2';
  if (environment === 'sandbox') return 'nt009r1';
  const parsed = Date.parse(productionStart ?? '');
  const start = Number.isFinite(parsed) ? parsed : Date.parse(DEFAULT_NT009R1_PRODUCTION_START);
  return at >= start ? 'nt009r1' : 'nt004';
}

const header = (xml: string) => { const a = xml.indexOf('<tpEmit>'), b = xml.indexOf('<cLocEmi>'); if (a < 0 || b < a) throw new Error('DPS_BASE_INVALIDA'); return [a, b] as const; };
/** Layout of a DPS built by notem: finNFSe inside the infDPS header (between tpEmit and cLocEmi) only exists in NT 009. */
export function detectDpsLayout(xml: string): DpsLayout {
  const [a, b] = header(xml); if (!xml.slice(a, b).includes('<finNFSe>')) return 'nt004';
  // nt009r2 always carries indDest at the root of infDPS (before serv); nt009r1 only inside IBSCBS.
  const dest = xml.indexOf('<indDest>'), serv = xml.indexOf('<serv>'); return dest >= 0 && serv >= 0 && dest < serv ? 'nt009r2' : 'nt009r1';
}

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
  // nt009r2 needs data absent from earlier bases (regApIBSCBSSN, cAtvSN): never converted; the send is "not sent".
  if (source === 'nt009r2' || target === 'nt009r2') throw new Error(LAYOUT_NOT_CONVERTIBLE);
  if (!DPS_LAYOUTS[target].ibsCbs && xml.includes('<IBSCBS>')) throw new Error(IBSCBS_OLD_LAYOUT_ERROR);
  if (!DPS_LAYOUTS[target].alphanumericCnpj && dpsHasAlphanumericCnpj(xml)) throw new Error(ALPHANUMERIC_CNPJ_CONVERSION_ERROR);
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

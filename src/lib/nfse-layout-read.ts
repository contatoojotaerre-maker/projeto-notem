// Tolerant readers for parsed NFS-e/DPS objects (fast-xml-parser, namespace prefixes removed).
// They accept the layout before NT 009 and NT 009 (release 1 and later); NT 008 tables cite pre-NT 009 paths.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsed XML of unknown shape, read defensively
type Obj = any;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {});
const first = (...v: unknown[]) => v.find(x => x !== undefined && x !== null && x !== '');

/** Official finNFSe domain (Anexo VI v1.04.01). */
export const FIN_NFSE_LABELS: Record<string, string> = { '0': 'NFS-e regular', '1': 'NFS-e de crédito', '2': 'NFS-e de débito' };
/** finNFSe: infDPS/finNFSe (NT 009) or infDPS/IBSCBS/finNFSe (before NT 009). */
export function finNFSeOf(infDPS: unknown): string | null { const d = obj(infDPS); const v = first(d.finNFSe, obj(d.IBSCBS).finNFSe); return v === undefined ? null : String(v); }
/** Description printed in the DANFSe field "Finalidade" (NT 008 v1.02: description, never the code). */
export function finNFSeLabel(infDPS: unknown): string { const v = finNFSeOf(infDPS); return v === null ? '-' : FIN_NFSE_LABELS[v] ?? v; }

/** CST/cClassTrib: IBSCBS/valores/trib (NT 009) or IBSCBS/valores/trib/gIBSCBS (before NT 009). */
export function ibsCbsClassOf(infDPS: unknown): { cst: string | null; cClassTrib: string | null } {
  const t = obj(obj(obj(obj(infDPS).IBSCBS).valores).trib); const g = obj(t.gIBSCBS);
  const cst = first(t.CST, g.CST), cls = first(t.cClassTrib, g.cClassTrib);
  return { cst: cst === undefined ? null : String(cst), cClassTrib: cls === undefined ? null : String(cls) };
}

/** Destination: indDest/dest at the root of infDPS (NT 009 item 2.11, later releases) or inside IBSCBS (earlier). */
export function destinationOf(infDPS: unknown): { indDest: string | null; dest: Obj | null } {
  const d = obj(infDPS), b = obj(d.IBSCBS); const ind = first(d.indDest, b.indDest); const dest = first(d.dest, b.dest);
  return { indDest: ind === undefined ? null : String(ind), dest: dest && typeof dest === 'object' ? dest as Obj : null };
}
export type DestinationBlock = { kind: 'person'; dest: Obj } | { kind: 'same'; text: string } | { kind: 'none'; text: string };
export const DEST_SAME_TEXT = 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO';
export const DEST_NONE_TEXT = 'DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e';
/** NT 008 v1.02 item 2.3: own block when dest exists; "same as buyer" when indDest = 0; "not identified" only without indication. */
export function destinationBlock(infDPS: unknown): DestinationBlock {
  const { indDest, dest } = destinationOf(infDPS);
  if (dest) return { kind: 'person', dest };
  if (indDest === '0') return { kind: 'same', text: DEST_SAME_TEXT };
  return { kind: 'none', text: DEST_NONE_TEXT };
}

/** Informed adjustment of the ISSQN base in the DPS: vAjusteBC (NT 009) or vDedRed (before). */
export function dpsBaseAdjustmentOf(infDPS: unknown): Obj | null { const v = obj(obj(infDPS).valores); const g = first(v.vAjusteBC, v.vDedRed); return g && typeof g === 'object' ? g as Obj : null; }
/** Calculated ISSQN base adjustment in the NFS-e: vCalcAjusteBCISSQN (NT 009) or vCalcDR (before). */
export function issBaseAdjustmentOf(nfseValores: unknown): string | null { const v = obj(nfseValores); const x = first(v.vCalcAjusteBCISSQN, v.vCalcDR); return x === undefined ? null : String(x); }
/** Calculated IBS/CBS base adjustment in the NFS-e IBSCBS/valores: vCalcAjusteBCIBSCBS (NT 009) or vCalcReeRepRes (before). */
export function ibsCbsBaseAdjustmentOf(ibsValores: unknown): string | null { const v = obj(ibsValores); const x = first(v.vCalcAjusteBCIBSCBS, v.vCalcReeRepRes); return x === undefined ? null : String(x); }
/** cIndOp: optional in NT 009 (only when the classification requires taxation). */
export function indOpOf(infDPS: unknown): string | null { const v = obj(obj(infDPS).IBSCBS).cIndOp; return v === undefined || v === null || v === '' ? null : String(v); }

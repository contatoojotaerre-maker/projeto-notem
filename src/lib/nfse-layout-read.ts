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

/** Public `ibs_cbs` object (API, webhooks, panel): values calculated by the government, read from infNFSe/IBSCBS. */
export type IbsCbsValues = {
  classificacao: { cst: string | null; codigo: string | null }; indicador_operacao: string | null; consumidor_final: boolean;
  localidade_incidencia: { codigo_municipio: string | null; nome: string | null };
  percentual_redutor: string | null; base_calculo: string | null; ajuste_base_calculo: string | null; ajuste_base_locacao_imoveis: string | null;
  ibs_uf: { aliquota: string | null; reducao_aliquota: string | null; aliquota_efetiva: string | null; valor: string | null; diferimento: string | null };
  ibs_municipal: { aliquota: string | null; reducao_aliquota: string | null; aliquota_efetiva: string | null; valor: string | null; diferimento: string | null };
  cbs: { aliquota: string | null; reducao_aliquota: string | null; aliquota_efetiva: string | null; valor: string | null; diferimento: string | null };
  valor_total_ibs: string | null; valor_total_ibs_cbs: string | null; valor_total_nota: string | null;
  credito_presumido_ibs: { percentual: string | null; valor: string | null } | null; credito_presumido_cbs: { percentual: string | null; valor: string | null } | null;
  receita_bruta_simples: string | null; versao_calculadora: string | null;
};
const s = (v: unknown) => (v === undefined || v === null || v === '' || typeof v === 'object' ? null : String(v));
/** Decimal strings added exactly in cents (no floating point). */
export function addDecimals(...v: (string | null | undefined)[]): string | null {
  const parts = v.filter((x): x is string => typeof x === 'string' && /^-?\d+(\.\d{1,2})?$/.test(x)); if (!parts.length) return null;
  const cents = parts.reduce((t, x) => { const neg = x.startsWith('-'); const [i, f = ''] = x.replace('-', '').split('.'); const c = BigInt(i!) * 100n + BigInt((f + '00').slice(0, 2)); return t + (neg ? -c : c); }, 0n);
  const neg = cents < 0n, a = neg ? -cents : cents; return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
}
/** Reads the government-calculated IBS/CBS of an authorized NFS-e (parsed infNFSe); null when the note has no group. */
export function ibsCbsValuesOf(infNFSe: unknown): IbsCbsValues | null {
  const n = obj(infNFSe); const g = obj(n.IBSCBS); const d = obj(obj(n.DPS).infDPS); const dg = obj(d.IBSCBS);
  if (!n.IBSCBS && !d.IBSCBS) return null;
  const v = obj(g.valores), uf = obj(v.uf), mun = obj(v.mun), fed = obj(v.fed), tot = obj(g.totCIBS), gi = obj(tot.gIBS), gc = obj(tot.gCBS);
  const cls = ibsCbsClassOf(d); const ibs = s(gi.vIBSTot), cbs = s(gc.vCBS);
  const pres = (p: Obj, k: 'IBS' | 'CBS') => (p && Object.keys(p).length ? { percentual: s(p[`pCredPres${k}`]), valor: s(p[`vCredPres${k}`]) } : null);
  return {
    classificacao: { cst: cls.cst, codigo: cls.cClassTrib }, indicador_operacao: s(dg.cIndOp), consumidor_final: s(dg.indFinal) === '1',
    localidade_incidencia: { codigo_municipio: s(g.cLocalidadeIncid), nome: s(g.xLocalidadeIncid) },
    percentual_redutor: s(g.pRedutor), base_calculo: s(v.vBC), ajuste_base_calculo: s(v.vCalcAjusteBCIBSCBS), ajuste_base_locacao_imoveis: s(v.vCalcAjusteBCLocImoveis),
    ibs_uf: { aliquota: s(uf.pIBSUF), reducao_aliquota: s(uf.pRedAliqUF), aliquota_efetiva: s(uf.pAliqEfetUF), valor: s(obj(gi.gIBSUFTot).vIBSUF), diferimento: s(obj(gi.gIBSUFTot).vDifUF) },
    ibs_municipal: { aliquota: s(mun.pIBSMun), reducao_aliquota: s(mun.pRedAliqMun), aliquota_efetiva: s(mun.pAliqEfetMun), valor: s(obj(gi.gIBSMunTot).vIBSMun), diferimento: s(obj(gi.gIBSMunTot).vDifMun) },
    cbs: { aliquota: s(fed.pCBS), reducao_aliquota: s(fed.pRedAliqCBS), aliquota_efetiva: s(fed.pAliqEfetCBS), valor: cbs, diferimento: s(gc.vDifCBS) },
    valor_total_ibs: ibs, valor_total_ibs_cbs: addDecimals(ibs, cbs), valor_total_nota: s(tot.vTotNF),
    credito_presumido_ibs: pres(obj(gi.gIBSCredPres), 'IBS'), credito_presumido_cbs: pres(obj(gc.gCBSCredPres), 'CBS'),
    // Later releases (Anexo VI v1.04.01): read when present, never required.
    receita_bruta_simples: s(first(v.vReceitaBrutaSN, obj(tot.gTribSN).vReceitaBrutaSN)), versao_calculadora: s(first(n.verCalcIBSCBS, g.verCalcIBSCBS)),
  };
}
/**
 * NT 008 v1.02 "Exclusões e Reduções da Base de Cálculo": vDescIncond + base adjustment (vCalcReeRepRes / vCalcAjusteBCIBSCBS)
 * + vISSQN + vPis + vCofins (sum of every field present); null when none is present.
 */
export function ibsCbsExclusionsOf(infNFSe: unknown): string | null {
  const n = obj(infNFSe), d = obj(obj(n.DPS).infDPS), dv = obj(d.valores), pc = obj(obj(obj(dv.trib).tribFed).piscofins);
  const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));
  return addDecimals(str(obj(dv.vDescCondIncond).vDescIncond), ibsCbsBaseAdjustmentOf(obj(n.IBSCBS).valores), str(obj(n.valores).vISSQN), str(pc.vPis), str(pc.vCofins));
}

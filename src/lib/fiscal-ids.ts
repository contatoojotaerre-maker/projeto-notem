// Formats of the fiscal identifiers that carry the CNPJ (NT 009 release 1). The CNPJ occupies positions 10–23 of the
// access key, as in TSIdNFSe, TSIdDPS, TSIdPedRegEvt and TSIdEvento. The official TSChaveNFSe type admits letters only
// at positions 7–20 (known defect, docs/interno/defeitos-esquema-oficial.md); notem validates by the real structure.

/** Access key: cMun(7) ambGer(1) tpInsc(1) inscrição(14, alphanumeric) nNFSe(13) AAMM(4) código(9) DV(1). */
export const ACCESS_KEY_PATTERN = /^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$/;
export const NFSE_ID_PATTERN = /^NFS[0-9]{9}[0-9A-Z]{14}[0-9]{27}$/;
export const DPS_ID_PATTERN = /^DPS[0-9]{7}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}$/;
/** Pattern published in the official TSChaveNFSe (release 1) — used only to explain government schema rejections. */
export const OFFICIAL_TSCHAVE_PATTERN = /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/;
export const isAccessKey = (value: unknown): value is string => typeof value === 'string' && ACCESS_KEY_PATTERN.test(value);
/** True when a valid key would be refused by the defective official TSChaveNFSe pattern. */
export const keyHitsSchemaDefect = (value: unknown) => isAccessKey(value) && !OFFICIAL_TSCHAVE_PATTERN.test(value);

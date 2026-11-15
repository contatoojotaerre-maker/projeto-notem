// Builder for NFS-e "pedido de registro de evento" (pedRegEvento v1.01), unsigned.
// The transmissor only signs and sends; content is the notem's responsibility.
import { isValidCnpj } from './notem';
import { RuleError } from './rule-error';
import { FISCAL_TEXT_MESSAGE, fiscalTextAccepted } from './fiscal-text';

export const cancelReasons = { erro_emissao: '1', servico_nao_prestado: '2', outros: '9' } as const;
export const substitutionReasons = { desenquadramento_simples: '01', enquadramento_simples: '02', inclusao_imunidade_isencao: '03', exclusao_imunidade_isencao: '04', rejeicao_tomador_intermediario: '05', outros: '99' } as const;
export type CancelReason = keyof typeof cancelReasons;
export type SubstitutionReason = keyof typeof substitutionReasons;
export const fiscalEventCodes = { cancel: '101101', analysis: '101103' } as const;
export type FiscalEventCode = typeof fiscalEventCodes[keyof typeof fiscalEventCodes];
const descriptions: Record<FiscalEventCode, string> = {
  '101101': 'Cancelamento de NFS-e',
  '101103': 'Solicitação de Análise Fiscal para Cancelamento de NFS-e',
};
/** Brasília wall clock with fixed -03:00 offset (official TSDateTimeUTC). */
export function brasiliaNow(now = Date.now()) { return new Date(now - 3 * 3600_000).toISOString().replace(/\.\d{3}Z$/, '-03:00'); }

/**
 * TSMotivo = TSString (15–255): only U+0020–U+00FF, no line breaks and no
 * leading/trailing spaces. Returns an error message in Portuguese or null.
 */
export function justificationError(text: string) {
  const length = [...text].length;
  if (length < 15 || length > 255) return 'A justificativa deve ter de 15 a 255 caracteres.';
  if (text !== text.trim()) return 'Remova espaços no início e no fim da justificativa.';
  if (!/^[\u0020-\u00FF]+$/.test(text)) return 'Use somente letras, números e pontuação comuns, sem quebras de linha, emojis ou símbolos especiais.';
  return null;
}
export const escapeXml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Access key layout: cMun(7) ambGer(1) tpInsc(1) inscrição(14) nNFSe(13) AAMM(4) código(9) DV(1). */
export function accessKeyIssuer(key: string) {
  if (!/^\d{50}$/.test(key)) return null;
  return { municipality: key.slice(0, 7), inscriptionType: key[8], inscription: key.slice(9, 23) };
}
export function eventRequestId(accessKey: string, code: FiscalEventCode) {
  if (!/^\d{50}$/.test(accessKey)) throw new RuleError('Chave de acesso inválida.');
  return `PRE${accessKey}${code}`;
}
export type FiscalEventInput = {
  code: FiscalEventCode; environment: 'sandbox' | 'production'; accessKey: string; authorCnpj: string;
  occurredAt: string; reason: CancelReason; justification: string;
};
export function buildFiscalEvent(input: FiscalEventInput) {
  if (!(input.code in descriptions)) throw new RuleError('Tipo de evento não suportado.');
  const id = eventRequestId(input.accessKey, input.code);
  if (!/^\d{14}$/.test(input.authorCnpj) || !isValidCnpj(input.authorCnpj)) throw new RuleError('CNPJ do autor inválido.');
  const issuer = accessKeyIssuer(input.accessKey);
  if (issuer?.inscriptionType !== '2' || issuer.inscription !== input.authorCnpj) throw new RuleError('O autor do evento deve ser o prestador da nota (E0812).');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/.test(input.occurredAt) || !Number.isFinite(Date.parse(input.occurredAt))) throw new RuleError('Data e hora do evento inválida.');
  const reason = cancelReasons[input.reason]; if (!reason) throw new RuleError('Motivo inválido.');
  const error = justificationError(input.justification); if (error) throw new RuleError(error);
  if (!fiscalTextAccepted(input.justification)) throw new RuleError(`A justificativa ${FISCAL_TEXT_MESSAGE}.`);
  const body = `<tpAmb>${input.environment === 'production' ? 1 : 2}</tpAmb><verAplic>notem-1.0</verAplic><dhEvento>${input.occurredAt}</dhEvento><CNPJAutor>${input.authorCnpj}</CNPJAutor><chNFSe>${input.accessKey}</chNFSe><e${input.code}><xDesc>${escapeXml(descriptions[input.code])}</xDesc><cMotivo>${reason}</cMotivo><xMotivo>${escapeXml(input.justification)}</xMotivo></e${input.code}>`;
  return { id, xml: `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infPedReg Id="${id}">${body}</infPedReg></pedRegEvento>` };
}

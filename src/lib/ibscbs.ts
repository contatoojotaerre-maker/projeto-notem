// IBS/CBS rules shared by panel, API, DPS builder and readiness. notem sends only the classification; the government
// (Sefin calculator) computes rates, base and values. Messages here are identical to public.ibscbs_service_rule_error.

export type IbsCbsClassification = {
  code: string; cst: string; cst_description?: string; description?: string; requires_taxation: boolean;
  regular_taxation: boolean; presumed_credit: boolean; deferral: boolean;
  ibs_reduction_percent?: number | string; cbs_reduction_percent?: number | string; simples_revenue_type?: string | null; donation_type?: string | null; legislation_url?: string | null;
};
export type OperationIndicator = { code: string; active: boolean; incidence_location?: string | null; operation_type?: string; supply_characteristic?: string; location_to_identify?: string };

export const IBSCBS_MESSAGES = {
  activity10: 'A atividade 10 do Simples deve ser usada se, e somente se, o serviço for do subitem 16.01.',
  activity11: 'A atividade 11 do Simples deve ser usada se, e somente se, o serviço for 99.04.01.',
  activity1213: 'As atividades 12 ou 13 do Simples devem ser usadas se, e somente se, o serviço for dos subitens 7.02 ou 7.05.',
  unknownClassification: 'Selecione uma classificação tributária do catálogo oficial.',
  realEstate: 'Serviços dos subitens 99.03, 99.04 e 99.05 (imóveis, bens móveis e condomínios) ainda não são suportados para IBS/CBS.',
  operationType: 'Serviços dos subitens 25.05, 15.09, 17.12 e 10.05 exigem o tipo de operação (tpOper), ainda não suportado para IBS/CBS.',
  specialRegime: 'Classificações que exigem tributação regular, crédito presumido ou diferimento ainda não são suportadas.',
  creditAdjustment: 'Classificações de transferência ou ajuste de crédito (CST 800 e 811) ainda não são suportadas.',
  donation: 'Doações (410003 e 410026) ainda não são suportadas.',
  indicatorRequired: 'Informe o indicador de operação: a classificação escolhida exige tributação do IBS/CBS (E0860).',
  indicatorForbidden: 'Não informe o indicador de operação: a classificação escolhida não tem tributação do IBS/CBS (E0859).',
  indicatorInactive: 'Este indicador de operação foi retirado da tabela oficial (Anexo VII v1.03). Escolha outro.',
  regimeNotAllowed: 'O regime de apuração do IBS/CBS escolhido não é permitido para o regime de apuração do ISS desta empresa.',
  nbsRequired: 'Informe o código NBS do serviço: ele é obrigatório quando a nota leva IBS/CBS (E0322).',
  cstMismatch: 'O CST deve ser igual aos três primeiros dígitos da classificação tributária (E0959).',
  takerRequired: 'Com IBS/CBS tributado e o local da operação no endereço do tomador, identifique o tomador por CPF ou CNPJ com endereço no Brasil (E0239/E0243).',
  layoutWithoutIbsCbs: 'A nota precisa do grupo IBS/CBS, que só existe no leiaute da NT 009. Aguarde a vigência da NT 009 em produção.',
  simplesActivityRequired: 'Informe a atividade do Simples Nacional do serviço: ela é obrigatória para ME/EPP no próximo leiaute.',
  simplesActivityForbidden: 'A atividade do Simples Nacional não deve ser informada para empresa não optante ou MEI.',
} as const;

export const TAKER_MUNICIPALITY_NOTICE = 'O município do tomador deve ser o mesmo do cadastro na Receita Federal.';
export const TAKER_MUNICIPALITY_REJECTION = 'O governo informou que o município do tomador é diferente do cadastro do CPF/CNPJ na Receita Federal. Corrija o endereço do tomador para o município registrado na Receita e emita novamente.';
export const SIMPLES_ACTIVITIES: [string, string][] = [
  ['07', 'Serviços com ISS tributados exclusivamente pelo Anexo III'], ['08', 'Serviços contábeis com ISS fixo (Anexo III)'], ['09', 'Serviços sujeitos ao Fator "R" (Anexo III ou V)'],
  ['10', 'Transporte municipal de passageiros, subitem 16.01 (Anexo III)'], ['11', 'Locação de bens móveis e operações sem ISS (Anexo III)'],
  ['12', 'Construção civil, subitens 7.02 e 7.05 (Anexo III)'], ['13', 'Construção civil, subitens 7.02 e 7.05 (Anexo IV)'], ['14', 'Serviços do Anexo IV'], ['90', 'Operações não tributadas'],
];

/** regApIBSCBSSN (Anexo VI): only ME/EPP. Default and options follow the ISS regime chosen in regApTribSN. */
export const IBSCBS_REGIME_LABELS: Record<1 | 2 | 3, string> = { 1: 'Pelo Simples Nacional (DAS)', 2: 'CBS pelo Simples Nacional e IBS pelo regime regular', 3: 'Pelo regime regular' };
export function allowedIbsCbsRegimes(issRegime: number | null): (1 | 2 | 3)[] { return issRegime === 1 ? [1, 3] : issRegime === 2 ? [2, 3] : [3]; }
export function defaultIbsCbsRegime(issRegime: number | null): 1 | 2 | 3 { return issRegime === 1 ? 1 : issRegime === 2 ? 2 : 3; }

/** Default first competence (inclusive) that must carry the IBSCBS group, per environment. */
export const DEFAULT_IBSCBS_REQUIRED_FROM = '2027-01-01';
export const brDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
export function ibsCbsRequired(competence: string, requiredFrom: string | null | undefined) { return competence.slice(0, 10) >= (requiredFrom && /^\d{4}-\d{2}-\d{2}/.test(requiredFrom) ? requiredFrom.slice(0, 10) : DEFAULT_IBSCBS_REQUIRED_FROM); }
export const ibsCbsPendingWarning = (requiredFrom: string) => `Classificação IBS/CBS pendente — obrigatória a partir de ${brDate(requiredFrom)}.`;
export const ibsCbsMissingMessage = (requiredFrom: string) => `Classifique o serviço para IBS/CBS (NBS, classificação tributária e indicador de operação): obrigatório para competência a partir de ${brDate(requiredFrom)}.`;
/** Today in Brasília (YYYY-MM-DD). */
export const todayBr = (now = Date.now()) => new Date(now - 3 * 3600_000).toISOString().slice(0, 10);

/** Same rule as public.ibscbs_service_rule_error; `classification` is the catalog row of `classificationCode` (undefined when not found). */
export function ibsCbsServiceRuleError(serviceCode: string, classificationCode: string | null | undefined, classification: IbsCbsClassification | null | undefined, indicator: string | null | undefined, activity: string | null | undefined): string | null {
  const sub = (serviceCode ?? '').slice(0, 4);
  if (activity) {
    if ((sub === '1601') !== (activity === '10')) return IBSCBS_MESSAGES.activity10;
    if (((serviceCode ?? '').slice(0, 6) === '990401') !== (activity === '11')) return IBSCBS_MESSAGES.activity11;
    if (['0702', '0705'].includes(sub) !== ['12', '13'].includes(activity)) return IBSCBS_MESSAGES.activity1213;
  }
  if (!classificationCode) return null;
  if (!classification) return IBSCBS_MESSAGES.unknownClassification;
  if (['9903', '9904', '9905'].includes(sub)) return IBSCBS_MESSAGES.realEstate;
  if (['2505', '1509', '1712', '1005'].includes(sub)) return IBSCBS_MESSAGES.operationType;
  if (classification.regular_taxation || classification.presumed_credit || classification.deferral) return IBSCBS_MESSAGES.specialRegime;
  if (['800', '811'].includes(classification.cst)) return IBSCBS_MESSAGES.creditAdjustment;
  if (['410003', '410026'].includes(classification.code)) return IBSCBS_MESSAGES.donation;
  if (classification.requires_taxation && !indicator) return IBSCBS_MESSAGES.indicatorRequired;
  if (!classification.requires_taxation && indicator) return IBSCBS_MESSAGES.indicatorForbidden;
  return null;
}
/** Reason a classification cannot be chosen in this phase (independent of the service), or null. */
export function unsupportedClassificationReason(c: IbsCbsClassification): string | null {
  if (c.regular_taxation || c.presumed_credit || c.deferral) return IBSCBS_MESSAGES.specialRegime;
  if (['800', '811'].includes(c.cst)) return IBSCBS_MESSAGES.creditAdjustment;
  if (['410003', '410026'].includes(c.code)) return IBSCBS_MESSAGES.donation;
  return null;
}

/** Incidence in the taker's (or destination = taker, indDest 0) address: Anexo VII column NFSeLocIncidIBS. */
export function indicatorPointsToTaker(incidence: string | null | undefined) { return /Endereço do (Tomador|Destinatário)/i.test(incidence ?? ''); }

export type ServiceIbsCbs = { service_code: string; nbs_code?: string | null; ibscbs_classification?: string | null; ibscbs_operation_indicator?: string | null; simples_activity_code?: string | null; classification?: IbsCbsClassification | null; indicator?: OperationIndicator | null };
/** "a revisar": the stored indicator was retired from the official table. */
export function serviceNeedsReview(s: ServiceIbsCbs) { return !!s.ibscbs_operation_indicator && s.indicator?.active === false; }
/** Problems that keep a service from issuing with IBS/CBS (empty = complete). */
export function serviceIbsCbsIssues(s: ServiceIbsCbs): string[] {
  const out: string[] = [];
  if (!s.ibscbs_classification) out.push('sem classificação tributária');
  if (!s.nbs_code) out.push('sem código NBS');
  const rule = ibsCbsServiceRuleError(s.service_code, s.ibscbs_classification, s.classification, s.ibscbs_operation_indicator, s.simples_activity_code);
  if (rule && s.ibscbs_classification) out.push(rule);
  if (serviceNeedsReview(s)) out.push('indicador de operação a revisar');
  return out;
}

/** Item of the Anexo VIII correlation for a national tax code: 010501 → 01.05; 99xxyy → 99.xx.yy. */
export function serviceItemOf(code: string) { return /^\d{6}$/.test(code) ? (code.startsWith('99') ? `${code.slice(0, 2)}.${code.slice(2, 4)}.${code.slice(4, 6)}` : `${code.slice(0, 2)}.${code.slice(2, 4)}`) : null; }
export type Correlation = { service_item: string; item_description?: string | null; simples_activity: string | null; simples_activity_description?: string | null; nbs: { code: string; formatted_code: string; description?: string | null }[]; operation_indicators: { code: string; incidence_location?: string | null }[]; classifications: { code: string; description?: string | null }[] };
export type SuggestedValue = { codigo: string; descricao: string | null; aplicavel: boolean; motivo: string | null };
export type Suggestion = { item: string; nbs: SuggestedValue | null; classificacao: SuggestedValue | null; indicador_operacao: SuggestedValue | null; atividade_simples: SuggestedValue | null; alternativas: { nbs: string[]; classificacoes: string[]; indicadores_operacao: string[] }; aviso: string | null };
/**
 * Anexo VIII suggestion (never applied automatically). Values the NFS-e does not accept, values blocked in this phase and
 * inconsistent indicator/classification pairs come back with aplicavel = false and the reason.
 */
export function buildSuggestion(serviceCode: string, c: Correlation, catalogs: { classifications: Map<string, IbsCbsClassification>; indicators: Map<string, OperationIndicator>; nbs: Set<string> }): Suggestion {
  const nbs = c.nbs[0]; const cls = c.classifications[0]; const ind = c.operation_indicators[0];
  const clsRow = cls ? catalogs.classifications.get(cls.code) : undefined; const indRow = ind ? catalogs.indicators.get(ind.code) : undefined;
  const v = (codigo: string, descricao: string | null | undefined, motivo: string | null): SuggestedValue => ({ codigo, descricao: descricao ?? null, aplicavel: motivo === null, motivo });
  const clsReason = !cls ? null : !clsRow ? 'Classificação não aceita na NFS-e.' : ibsCbsServiceRuleError(serviceCode, cls.code, clsRow, clsRow.requires_taxation ? '000000' : null, null);
  const indReason = !ind ? null : !indRow ? 'Indicador não aceito na NFS-e.' : !indRow.active ? IBSCBS_MESSAGES.indicatorInactive : clsRow && !clsRow.requires_taxation ? IBSCBS_MESSAGES.indicatorForbidden : null;
  const atv = c.simples_activity;
  const atvReason = !atv ? null : atv === 'IMP' ? 'Atividade impeditiva no Simples Nacional.' : !SIMPLES_ACTIVITIES.some(([k]) => k === atv) ? 'Atividade não reconhecida.' : ibsCbsServiceRuleError(serviceCode, null, null, null, atv);
  return {
    item: c.service_item,
    nbs: nbs ? v(nbs.code, nbs.description, catalogs.nbs.has(nbs.code) ? null : 'NBS não encontrado no catálogo oficial.') : null,
    classificacao: cls ? v(cls.code, cls.description ?? clsRow?.description, clsReason) : null,
    indicador_operacao: ind ? v(ind.code, ind.incidence_location, indReason) : null,
    atividade_simples: atv ? v(atv, c.simples_activity_description, atvReason) : null,
    alternativas: { nbs: c.nbs.slice(1).map(x => x.code), classificacoes: c.classifications.slice(1).map(x => x.code), indicadores_operacao: c.operation_indicators.slice(1).map(x => x.code) },
    aviso: atv === 'IMP' ? 'A tabela oficial indica atividade impeditiva no Simples Nacional para este serviço.' : null,
  };
}

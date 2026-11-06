// Pure, client-safe translation between the public API v1 contract (Portuguese, readable values)
// and the current database codes. Shared by API routes, the panel and tests.
import { z } from 'zod';
import { fiscalSchema, validReadinessCertificate } from './fiscal';
import { agreementUnavailableMessage, certificateSituation } from './certificates';
import { isValidCnpj, digits } from './notem';

export type Env = 'sandbox' | 'production';
export const envLabel = (e: Env) => (e === 'sandbox' ? 'homologacao' : 'producao');

/** ISO 8601 in Brasília offset (-03:00). */
export function isoBr(value: string | null | undefined): string | null {
  if (!value) return null; const t = Date.parse(value); if (!Number.isFinite(t)) return null;
  const d = new Date(t - 3 * 3600_000); return d.toISOString().replace(/\.\d{3}Z$/, '-03:00');
}
export const pct = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v).toFixed(2));
const pctIn = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Use texto com ponto decimal e até 2 casas, ex.: "2.00".').nullable();

// ---------- Errors ----------
export type Detail = { campo: string; mensagem: string };
export class ApiFailure extends Error { constructor(public status: number, public code: string, public userMessage: string, public details: Detail[] = [], public headers: Record<string, string> = {}) { super(code); } }
export const defaultMessages: Record<string, string> = {
  AUTENTICACAO_INVALIDA: 'Chave de acesso inválida.', REQUISICAO_INVALIDA: 'Requisição inválida. Confira os campos enviados.', SEM_PERMISSAO: 'A integração não pode fazer esta operação.',
  NAO_ENCONTRADO: 'Recurso não encontrado.', CONFLITO: 'O estado atual não permite esta operação.', IDEMPOTENCIA_CONFLITO: 'Esta Idempotency-Key já foi usada com outro conteúdo.',
  REGRA_DE_NEGOCIO: 'Os dados violam uma regra de negócio.', LIMITE_EXCEDIDO: 'Muitas requisições. Aguarde e tente novamente.', GOVERNO_INDISPONIVEL: 'O serviço do governo está indisponível. Tente novamente em instantes.',
  ERRO_INTERNO: 'Falha interna da notem. Tente novamente com a mesma Idempotency-Key.', METODO_NAO_PERMITIDO: 'Método não permitido.',
  EMPRESA_DUPLICADA: 'Já existe uma empresa com este CNPJ nesta organização.', ID_EXTERNO_DUPLICADO: 'Já existe um recurso com este id_externo nesta organização.', CNPJ_IMUTAVEL: 'O CNPJ não pode ser alterado porque a empresa já tem certificado ou série.',
  EMPRESA_POSSUI_HISTORICO: 'A empresa já usou numeração de DPS e não pode ser excluída. Use ativa: false para desativá-la.',
  CERTIFICADO_SENHA_OU_ARQUIVO_INVALIDO: 'Senha incorreta ou arquivo inválido.', CERTIFICADO_SEM_CHAVE_PRIVADA: 'O arquivo não contém a chave privada (não é um A1).', CERTIFICADO_VENCIDO: 'Este certificado está vencido.',
  CERTIFICADO_AINDA_NAO_VALIDO: 'A validade deste certificado ainda não começou.', CERTIFICADO_CNPJ_NAO_ENCONTRADO: 'O certificado não é um e-CNPJ ICP-Brasil reconhecível.', CERTIFICADO_CNPJ_DIVERGENTE: 'O CNPJ do certificado é diferente do cadastro da empresa.',
};
export const fail = (status: number, code: string, details: Detail[] = [], message?: string) => new ApiFailure(status, code, message ?? defaultMessages[code] ?? defaultMessages['ERRO_INTERNO'] ?? code, details);
export function zodDetails(e: z.ZodError, map: Record<string, string> = {}): Detail[] {
  return e.issues.map(i => { const p = i.path.map(String).join('.'); return { campo: map[p] ?? (p || 'corpo'), mensagem: i.message }; });
}
export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T { const r = schema.safeParse(value); if (!r.success) throw fail(400, 'REQUISICAO_INVALIDA', zodDetails(r.error)); return r.data; }

// ---------- Pagination ----------
export function pageParams(url: URL) {
  const limite = Number(url.searchParams.get('limite') ?? 50); const raw = url.searchParams.get('cursor');
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'limite', mensagem: 'Use um número de 1 a 100.' }]);
  let offset = 0; if (raw) { try { const o = JSON.parse(atob(raw)) as { o?: unknown }; if (typeof o.o !== 'number' || o.o < 0 || !Number.isInteger(o.o)) throw 0; offset = o.o; } catch { throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'cursor', mensagem: 'Cursor inválido.' }]); } }
  return { limite, offset };
}
export function page<T>(rows: T[], limite: number, offset: number) { const more = rows.length > limite; return { dados: rows.slice(0, limite), proximo_cursor: more ? btoa(JSON.stringify({ o: offset + limite })) : null }; }

// ---------- Company ----------
const text = (max: number) => z.string().max(max);
export const externalId = z.string().trim().min(1).max(100).nullable();
const address = z.object({ cep: z.string().regex(/^\d{8}$/, 'CEP com 8 números.'), logradouro: text(200), numero: text(30), complemento: text(100).nullable().optional(), bairro: text(100), codigo_municipio: z.string().regex(/^\d{7}$/, 'Código IBGE de 7 dígitos.') }).strict();
const companyBase = { id_externo: externalId.optional(), cnpj: z.string().regex(/^\d{14}$/, 'CNPJ com 14 números.').refine(isValidCnpj, 'CNPJ inválido.'), razao_social: z.string().trim().min(1).max(200), nome_fantasia: text(200).optional(), inscricao_municipal: text(50).optional(), email: z.union([z.string().email('E-mail inválido.'), z.literal('')]).optional(), telefone: z.string().regex(/^\d{0,15}$/, 'Somente números.').optional(), ativa: z.boolean().optional() };
export const companyCreate = z.object({ ...companyBase, endereco: address }).strict();
export const companyPatch = z.object({ ...companyBase, endereco: address.partial().strict() }).partial().strict();
export type CompanyRow = { id: string; external_id: string | null; cnpj: string; legal_name: string; trade_name: string; municipal_registration: string; email: string; phone: string; postal_code: string; street: string; number: string; complement: string; district: string; municipality_ibge_code: string; state: string; active: boolean; created_at: string; updated_at: string; municipalities?: { name: string } | null };
export function companyOut(c: CompanyRow) {
  return { id: c.id, id_externo: c.external_id, cnpj: c.cnpj, razao_social: c.legal_name, nome_fantasia: c.trade_name || null, inscricao_municipal: c.municipal_registration || null, email: c.email || null, telefone: c.phone || null,
    endereco: { cep: c.postal_code || null, logradouro: c.street || null, numero: c.number || null, complemento: c.complement || null, bairro: c.district || null, codigo_municipio: c.municipality_ibge_code, municipio: c.municipalities?.name ?? null, uf: c.state || null },
    ativa: c.active, criada_em: isoBr(c.created_at), atualizada_em: isoBr(c.updated_at) };
}
export function companyIn(v: z.infer<typeof companyPatch>) {
  const r: Record<string, unknown> = {};
  if (v.id_externo !== undefined) r['external_id'] = v.id_externo; if (v.cnpj !== undefined) r['cnpj'] = digits(v.cnpj); if (v.razao_social !== undefined) r['legal_name'] = v.razao_social;
  if (v.nome_fantasia !== undefined) r['trade_name'] = v.nome_fantasia; if (v.inscricao_municipal !== undefined) r['municipal_registration'] = v.inscricao_municipal; if (v.email !== undefined) r['email'] = v.email;
  if (v.telefone !== undefined) r['phone'] = v.telefone; if (v.ativa !== undefined) r['active'] = v.ativa;
  const e = v.endereco; if (e) { if (e.cep !== undefined) r['postal_code'] = e.cep; if (e.logradouro !== undefined) r['street'] = e.logradouro; if (e.numero !== undefined) r['number'] = e.numero; if (e.complemento !== undefined) r['complement'] = e.complemento ?? ''; if (e.bairro !== undefined) r['district'] = e.bairro; if (e.codigo_municipio !== undefined) r['municipality_ibge_code'] = e.codigo_municipio; }
  return r;
}

// ---------- Fiscal settings ----------
const rev = <T extends string | number>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [String(v), k])) as Record<string, string>;
export const simplesMap = { nao_optante: 1, mei: 2, me_epp: 3 } as const;
export const regimeMap = { dentro_do_simples: 1, iss_fora_do_simples: 2, tudo_fora_do_simples: 3 } as const;
export const specialMap = { nenhum: 0, ato_cooperado: 1, estimativa: 2, microempresa_municipal: 3, notario_registrador: 4, profissional_autonomo: 5, sociedade_profissionais: 6, outros: 9 } as const;
export const modeMap = { percentual_simples: 'percent_simples', percentual_por_esfera: 'percent_by_sphere', nao_informar: 'none' } as const;
const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
export const fiscalIn = z.object({
  simples_nacional: z.enum(keys(simplesMap)), regime_apuracao_simples: z.enum(keys(regimeMap)).nullable().optional(), regime_especial: z.enum(keys(specialMap)),
  tributos_aproximados: z.object({ modo: z.enum(keys(modeMap)), percentual_simples: pctIn.optional(), federal: pctIn.optional(), estadual: pctIn.optional(), municipal: pctIn.optional() }).strict(),
  aliquota_iss_simples: pctIn.optional(), serie_dps: z.unknown().optional(),
}).strict();
const fiscalFieldMap: Record<string, string> = { simples_nacional_option: 'simples_nacional', simples_nacional_regime: 'regime_apuracao_simples', special_tax_regime: 'regime_especial', approx_taxes_mode: 'tributos_aproximados.modo', approx_simples_percent: 'tributos_aproximados.percentual_simples', approx_federal_percent: 'tributos_aproximados.federal', approx_state_percent: 'tributos_aproximados.estadual', approx_municipal_percent: 'tributos_aproximados.municipal', simples_iss_withholding_percent: 'aliquota_iss_simples' };
/** Converts contract values to DB codes and applies the same rules as the panel (E0713, ISS do Simples). */
export function fiscalToDb(v: z.infer<typeof fiscalIn>, ids: { company_id: string; organization_id: string }, dps_series: number | null) {
  const n = (x: string | null | undefined) => (x === null || x === undefined ? null : Number(x)); const t = v.tributos_aproximados;
  const row = { ...ids, simples_nacional_option: simplesMap[v.simples_nacional], simples_nacional_regime: v.regime_apuracao_simples ? regimeMap[v.regime_apuracao_simples] : null, special_tax_regime: specialMap[v.regime_especial], dps_series,
    approx_taxes_mode: modeMap[t.modo], approx_simples_percent: n(t.percentual_simples), approx_federal_percent: n(t.federal), approx_state_percent: n(t.estadual), approx_municipal_percent: n(t.municipal), simples_iss_withholding_percent: n(v.aliquota_iss_simples) };
  const r = fiscalSchema.safeParse(row);
  if (!r.success) throw fail(422, 'REGRA_DE_NEGOCIO', zodDetails(r.error, fiscalFieldMap));
  return r.data;
}
const fiscalConstraintMap: Record<string, { campo: string; mensagem: string }> = {
  company_fiscal_settings_check: { campo: 'regime_apuracao_simples', mensagem: 'Informe o regime de apuração apenas para ME/EPP (obrigatório nesse caso).' },
  company_fiscal_settings_check1: { campo: 'tributos_aproximados', mensagem: 'Os percentuais não combinam com o modo escolhido: percentual_simples exige só percentual_simples (MEI ou ME/EPP); percentual_por_esfera exige federal, estadual e municipal; nao_informar não aceita percentuais.' },
  company_fiscal_settings_approx_simples_percent_check: { campo: 'tributos_aproximados.percentual_simples', mensagem: 'Informe um percentual entre 0 e 100.' },
  company_fiscal_settings_approx_federal_percent_check: { campo: 'tributos_aproximados.federal', mensagem: 'Informe um percentual entre 0 e 100.' },
  company_fiscal_settings_approx_state_percent_check: { campo: 'tributos_aproximados.estadual', mensagem: 'Informe um percentual entre 0 e 100.' },
  company_fiscal_settings_approx_municipal_percent_check: { campo: 'tributos_aproximados.municipal', mensagem: 'Informe um percentual entre 0 e 100.' },
  company_fiscal_settings_approx_taxes_mode_check: { campo: 'tributos_aproximados.modo', mensagem: 'Modo de tributos aproximados inválido.' },
  company_fiscal_settings_simples_nacional_option_check: { campo: 'simples_nacional', mensagem: 'Opção do Simples Nacional inválida.' },
  company_fiscal_settings_simples_nacional_regime_check: { campo: 'regime_apuracao_simples', mensagem: 'Regime de apuração inválido.' },
  company_fiscal_settings_special_tax_regime_check: { campo: 'regime_especial', mensagem: 'Regime especial inválido.' },
  company_fiscal_settings_dps_series_check: { campo: 'serie_dps', mensagem: 'A série DPS deve estar entre 00001 e 49999.' },
};
const fiscalTriggerMap: [RegExp, string][] = [[/E0713/, 'tributos_aproximados'], [/alíquota do ISS/i, 'aliquota_iss_simples'], [/série/i, 'serie_dps']];
/** Maps a database refusal on company_fiscal_settings to the contract field; never returns "corpo". */
export function fiscalDbDetail(e: { code?: string; message: string }): { campo: string; mensagem: string } | null {
  if (e.code === '23514') { const name = Object.keys(fiscalConstraintMap).sort((a, b) => b.length - a.length).find(k => e.message.includes(`"${k}"`)); return name ? fiscalConstraintMap[name] : null; }
  if (e.code === 'P0001') { const hit = fiscalTriggerMap.find(([re]) => re.test(e.message)); return hit ? { campo: hit[1], mensagem: e.message } : null; }
  return null;
}
export type FiscalRow = { simples_nacional_option: number; simples_nacional_regime: number | null; special_tax_regime: number; dps_series: number | null; approx_taxes_mode: string; approx_simples_percent: number | null; approx_federal_percent: number | null; approx_state_percent: number | null; approx_municipal_percent: number | null; simples_iss_withholding_percent: number | null };
export function fiscalOut(s: FiscalRow) {
  return { simples_nacional: rev(simplesMap)[s.simples_nacional_option] ?? null, regime_apuracao_simples: s.simples_nacional_regime === null ? null : rev(regimeMap)[s.simples_nacional_regime] ?? null, regime_especial: rev(specialMap)[s.special_tax_regime] ?? null,
    tributos_aproximados: { modo: rev(modeMap)[s.approx_taxes_mode] ?? null, percentual_simples: pct(s.approx_simples_percent), federal: pct(s.approx_federal_percent), estadual: pct(s.approx_state_percent), municipal: pct(s.approx_municipal_percent) },
    aliquota_iss_simples: pct(s.simples_iss_withholding_percent), serie_dps: s.dps_series === null ? null : String(s.dps_series).padStart(5, '0') };
}

// ---------- Services ----------
export const taxationMap = { tributavel: 1, imunidade: 2, exportacao: 3, nao_incidencia: 4 } as const;
export const immunityMap = { nao_informado: 0, entes_federativos: 1, templos: 2, partidos_sindicatos_entidades: 3, livros_jornais_papel: 4, fonogramas_musicais: 5 } as const;
export const withholdingMap = { nao_retido: 1, retido_tomador: 2, retido_intermediario: 3 } as const;
const serviceBase = { id_externo: externalId.optional(), nome: z.string().trim().min(1).max(200), ativo: z.boolean(), codigo_servico: z.string().regex(/^\d{6}$/, 'Código nacional de 6 dígitos.'), codigo_municipal: text(20).nullable().optional(), codigo_nbs: z.string().regex(/^\d{9}$/, 'Código NBS de 9 dígitos.').nullable().optional(), descricao_padrao: text(2000).optional(), tributacao_iss: z.enum(keys(taxationMap)), tipo_imunidade: z.enum(keys(immunityMap)).nullable().optional(), retencao_iss: z.enum(keys(withholdingMap)), indicador_operacao_ibscbs: z.string().regex(/^\d{6}$/).nullable().optional(), numero_beneficio_municipal: text(50).nullable().optional(), descricao_servico: z.unknown().optional(), id: z.unknown().optional() };
export const serviceCreate = z.object({ ...serviceBase, ativo: z.boolean().default(true) }).strict();
export const servicePatch = z.object(serviceBase).partial().strict();
export type ServiceRow = { id: string; external_id: string | null; name: string; active: boolean; service_code: string; municipal_tax_code: string | null; nbs_code: string | null; default_description: string; iss_taxation: number; immunity_type: number | null; iss_withholding: number; ibscbs_operation_indicator: string | null; municipal_benefit_number: string | null; service_codes?: { description: string } | null };
export function serviceOut(s: ServiceRow) {
  return { id: s.id, id_externo: s.external_id, nome: s.name, ativo: s.active, codigo_servico: s.service_code, descricao_servico: s.service_codes?.description ?? null, codigo_municipal: s.municipal_tax_code, codigo_nbs: s.nbs_code, descricao_padrao: s.default_description,
    tributacao_iss: rev(taxationMap)[s.iss_taxation] ?? null, tipo_imunidade: s.immunity_type === null ? null : rev(immunityMap)[s.immunity_type] ?? null, retencao_iss: rev(withholdingMap)[s.iss_withholding] ?? null, indicador_operacao_ibscbs: s.ibscbs_operation_indicator, numero_beneficio_municipal: s.municipal_benefit_number };
}
/** Merges a (partial) contract body into the stored row and validates with the panel's schema. */
export function serviceToDb(v: z.infer<typeof servicePatch>, current: Partial<ServiceRow>) {
  const row = { name: v.nome ?? current.name, active: v.ativo ?? current.active ?? true, service_code: v.codigo_servico ?? current.service_code, municipal_tax_code: v.codigo_municipal !== undefined ? v.codigo_municipal : current.municipal_tax_code ?? null,
    nbs_code: v.codigo_nbs !== undefined ? v.codigo_nbs : current.nbs_code ?? null, default_description: v.descricao_padrao ?? current.default_description ?? '', iss_taxation: v.tributacao_iss ? taxationMap[v.tributacao_iss] : current.iss_taxation,
    immunity_type: v.tipo_imunidade !== undefined ? (v.tipo_imunidade === null ? null : immunityMap[v.tipo_imunidade]) : current.immunity_type ?? null, iss_withholding: v.retencao_iss ? withholdingMap[v.retencao_iss] : current.iss_withholding,
    ibscbs_operation_indicator: v.indicador_operacao_ibscbs !== undefined ? v.indicador_operacao_ibscbs : current.ibscbs_operation_indicator ?? null, municipal_benefit_number: v.numero_beneficio_municipal !== undefined ? v.numero_beneficio_municipal : current.municipal_benefit_number ?? null };
  if ((row.iss_taxation === 2) !== (row.immunity_type !== null)) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'tipo_imunidade', mensagem: 'Informe o tipo de imunidade somente com tributacao_iss "imunidade".' }]);
  return { ...row, ...(v.id_externo !== undefined ? { external_id: v.id_externo } : {}) };
}

// ---------- Certificate ----------
export const certificateIn = z.object({ arquivo_base64: z.string().min(1).max(140_000).regex(/^[A-Za-z0-9+/=\s]+$/, 'Base64 inválido.'), senha: z.string().min(1).max(500) }).strict();
export const transmissorToContract: Record<string, string> = { SENHA_OU_ARQUIVO_INVALIDO: 'CERTIFICADO_SENHA_OU_ARQUIVO_INVALIDO', ARQUIVO_INVALIDO: 'CERTIFICADO_SENHA_OU_ARQUIVO_INVALIDO', SEM_CHAVE_PRIVADA: 'CERTIFICADO_SEM_CHAVE_PRIVADA', CERTIFICADO_VENCIDO: 'CERTIFICADO_VENCIDO', CERTIFICADO_AINDA_NAO_VALIDO: 'CERTIFICADO_AINDA_NAO_VALIDO', CNPJ_NAO_ENCONTRADO: 'CERTIFICADO_CNPJ_NAO_ENCONTRADO', CNPJ_DIVERGENTE: 'CERTIFICADO_CNPJ_DIVERGENTE' };
export type CertRow = { holder: string; cnpj: string; issuer: string; serial_number: string; valid_from: string; valid_until: string; status: string };
export function certificateOut(c: CertRow, now = new Date()) {
  const s = certificateSituation(c.valid_from, c.valid_until, now);
  return { titular: c.holder, cnpj: c.cnpj, emissor: c.issuer, numero_serie: c.serial_number, valido_de: isoBr(c.valid_from), valido_ate: isoBr(c.valid_until), situacao: s.kind === 'expired' ? 'vencido' : s.kind === 'expiring' ? 'vencendo' : 'valido', dias_para_vencer: Math.max(0, s.days) };
}
/** Days until expiry milestone to notify, or null. Milestones: 30, 15, 7, 1 and expired. */
export function expiryMilestone(validUntil: string, now = Date.now()): '30' | '15' | '7' | '1' | 'vencido' | null {
  const days = Math.ceil((Date.parse(validUntil) - now) / 86_400_000); if (Date.parse(validUntil) <= now) return 'vencido';
  for (const m of [1, 7, 15, 30] as const) if (days <= m) return String(m) as '1' | '7' | '15' | '30';
  return null;
}

// ---------- Readiness ----------
export type ReadinessInput = { company: { active: boolean; cnpj: string }; certificates: { status: string; cnpj: string; valid_from: string; valid_until: string }[]; settings: Record<string, unknown> | null; services: { active: boolean }[]; lastQuery: { created_at: string; http_status: number | null; response_body: string | null; error_code: string | null } | null };
export type ReadinessItem = { item: string; ok: boolean | null; mensagem: string; verificado_em?: string | null };
const dateBr = (v: string) => new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
export function computeReadiness(env: Env, i: ReadinessInput, now = Date.now()) {
  const cert = i.certificates.find(c => validReadinessCertificate(c, i.company.cnpj, now));
  const fiscalOk = i.settings !== null && fiscalSchema.safeParse(i.settings).success;
  const active = i.services.filter(s => s.active).length;
  let municipio: ReadinessItem;
  const q = i.lastQuery;
  if (!q) municipio = { item: 'municipio', ok: null, verificado_em: null, mensagem: 'Município ainda não verificado neste ambiente.' };
  else {
    let msg: unknown = null; try { msg = q.response_body ? (JSON.parse(q.response_body) as { mensagem?: unknown }).mensagem : null; } catch { msg = null; }
    const unavailable = agreementUnavailableMessage(q.http_status, msg, env);
    const ok = !q.error_code && q.http_status === 200;
    municipio = { item: 'municipio', ok, verificado_em: isoBr(q.created_at), mensagem: ok ? 'Município atendido pelo emissor nacional.' : unavailable ? `${unavailable}.` : q.error_code ? 'Não foi possível verificar o município. Tente novamente.' : `O governo respondeu com status HTTP ${q.http_status}.` };
  }
  const itens: ReadinessItem[] = [
    { item: 'empresa_ativa', ok: i.company.active, mensagem: i.company.active ? 'Empresa ativa.' : 'Empresa desativada.' },
    { item: 'certificado', ok: !!cert, mensagem: cert ? `Certificado válido até ${dateBr(cert.valid_until)}.` : 'Nenhum certificado válido para o CNPJ da empresa.' },
    { item: 'configuracao_fiscal', ok: fiscalOk, mensagem: fiscalOk ? 'Configuração fiscal completa.' : 'Configuração fiscal pendente ou incompleta.' },
    { item: 'servico_ativo', ok: active > 0, mensagem: active > 0 ? `${active} ${active === 1 ? 'serviço ativo' : 'serviços ativos'}.` : 'Nenhum serviço ativo.' },
    municipio,
  ];
  const pendencias = itens.filter(x => x.ok !== true).map(x => x.item);
  return { ambiente: envLabel(env), pronta_para_emitir: pendencias.length === 0, itens, pendencias };
}

// ---------- Idempotency ----------
export async function bodyHash(method: string, path: string, body: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${method}\n${path}\n${body}`));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export const idempotencyKey = (v: string | null) => { if (v === null) return null; const k = v.trim(); if (!k || k.length > 100) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'Idempotency-Key', mensagem: 'Use um texto de 1 a 100 caracteres.' }]); return k; };

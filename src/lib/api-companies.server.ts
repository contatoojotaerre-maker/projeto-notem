// Business handlers for /api/v1 empresas and catalogos. Organization always comes from the key.
import { apiAudit, loadCompany, type ApiCtx, type ApiResult } from './api.server';
import { certificateIn, certificateOut, companyCreate, companyIn, companyOut, companyPatch, fail, idParam, fiscalDbDetail, fiscalIn, fiscalOut, fiscalToDb, page, pageParams, parseBody, searchParam, serviceCreate, serviceOut, servicePatch, serviceToDb, transmissorToContract, type CompanyRow, type FiscalRow, type ServiceRow } from './api-contract';
import { CNPJ_LOCK_MESSAGE, validReadinessCertificate,specialTaxRuleError } from './fiscal';
import { AGREEMENT_COOLDOWN_MS, MAX_CERTIFICATE_BYTES, toTransmissorEnvironment } from './certificates';
import { municipalitySearchTerm } from './municipality-search';
import { normalizeCnpj } from './notem';
import { IBSCBS_MESSAGES, unsupportedClassificationReason, type IbsCbsClassification } from './ibscbs';

const COMPANY_SELECT = '*, municipalities(name)';
const refresh = (ctx: ApiCtx, companyId: string) => ctx.background(import('./readiness.server').then(m => m.refreshReadiness(ctx.db, companyId, { request: ctx.request })));

function companyWriteError(e: { code?: string; message: string }, existing?: string | null): never {
  if (e.message.includes(CNPJ_LOCK_MESSAGE)) throw fail(409, 'CNPJ_IMUTAVEL');
  if (e.code === '23505') { if (/external_id/.test(e.message)) throw fail(409, 'ID_EXTERNO_DUPLICADO'); throw fail(409, 'EMPRESA_DUPLICADA', existing ? [{ campo: 'id', mensagem: existing }] : []); }
  if (e.code === '23503' || /Invalid municipality/.test(e.message)) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'endereco.codigo_municipio', mensagem: 'Município não encontrado no catálogo oficial.' }]);
  if (e.code === '23514' || e.code === '22P02') throw fail(400, 'REQUISICAO_INVALIDA');
  throw new Error('COMPANY_WRITE_FAILED');
}
async function existingByCnpj(ctx: ApiCtx, cnpj: string) { const r = await ctx.db.from('companies').select('id').eq('organization_id', ctx.organization_id).eq('cnpj', cnpj).maybeSingle(); return r.data?.id ?? null; }

// ---------- Empresas ----------
export async function listCompanies(ctx: ApiCtx): Promise<ApiResult> {
  const { limite, offset } = pageParams(ctx.url); const q = ctx.url.searchParams;
  let query = ctx.db.from('companies').select(COMPANY_SELECT).eq('organization_id', ctx.organization_id);
  if (q.get('cnpj')) query = query.eq('cnpj', normalizeCnpj(q.get('cnpj')!));
  if (q.get('id_externo')) query = query.eq('external_id', q.get('id_externo')!);
  const ativa = q.get('ativa'); if (ativa !== null) { if (!['true', 'false'].includes(ativa)) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'ativa', mensagem: 'Use true ou false.' }]); query = query.eq('active', ativa === 'true'); }
  const busca = searchParam(ctx.url); if (busca) { const term = `%${busca.replace(/[%_,()]/g, ' ')}%`; query = query.or(`legal_name.ilike.${term},trade_name.ilike.${term}`); }
  const r = await query.order('created_at', { ascending: false }).order('id').range(offset, offset + limite);
  if (r.error) throw new Error('COMPANY_LIST_FAILED');
  return { status: 200, body: page((r.data as unknown as CompanyRow[]).map(companyOut), limite, offset) };
}
export async function createCompany(ctx: ApiCtx): Promise<ApiResult> {
  const v = parseBody(companyCreate, ctx.body);
  const row = { ...companyIn(v), organization_id: ctx.organization_id, state: '', created_by: ctx.actor, ...apiAudit(ctx) };
  const r = await ctx.db.from('companies').insert(row as never).select(COMPANY_SELECT).single();
  if (r.error) companyWriteError(r.error, r.error.code === '23505' ? await existingByCnpj(ctx, v.cnpj) : null);
  const c = r.data as unknown as CompanyRow; ctx.setCompany(c.id); refresh(ctx, c.id);
  return { status: 201, body: companyOut(c) };
}
export async function getCompany(ctx: ApiCtx): Promise<ApiResult> { return { status: 200, body: companyOut(await loadCompany(ctx) as unknown as CompanyRow) }; }
export async function patchCompany(ctx: ApiCtx): Promise<ApiResult> {
  const current = await loadCompany(ctx); const v = parseBody(companyPatch, ctx.body);
  const r = await ctx.db.from('companies').update({ ...companyIn(v), ...apiAudit(ctx) } as never).eq('id', current.id).eq('organization_id', ctx.organization_id).select(COMPANY_SELECT).single();
  if (r.error) companyWriteError(r.error, v.cnpj ? await existingByCnpj(ctx, v.cnpj) : null);
  refresh(ctx, current.id); return { status: 200, body: companyOut(r.data as unknown as CompanyRow) };
}
export async function deleteCompany(ctx: ApiCtx): Promise<ApiResult> {
  const current = await loadCompany(ctx);
  const r = await ctx.db.rpc('delete_company_if_unused', { _company: current.id, _org: ctx.organization_id });
  if (r.error) throw new Error('COMPANY_DELETE_FAILED');
  if (r.data === 'NAO_ENCONTRADO') throw fail(404, 'NAO_ENCONTRADO');
  if (r.data === 'EMPRESA_POSSUI_HISTORICO') throw fail(409, 'EMPRESA_POSSUI_HISTORICO');
  return { status: 204 };
}

// ---------- Configuração fiscal ----------
function fiscalWriteError(e: { code?: string; message: string }): never {
  const detail = fiscalDbDetail(e); if (detail) throw fail(422, 'REGRA_DE_NEGOCIO', [detail]);
  console.error('FISCAL_WRITE_FAILED', e.code, e.message); throw new Error('FISCAL_WRITE_FAILED');
}
export async function getFiscal(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx); const r = await ctx.db.from('company_fiscal_settings').select('*').eq('company_id', c.id).maybeSingle();
  if (r.error) throw new Error('FISCAL_READ_FAILED'); if (!r.data) throw fail(404, 'NAO_ENCONTRADO', [], 'A empresa ainda não tem configuração fiscal.');
  return { status: 200, body: fiscalOut(r.data as unknown as FiscalRow) };
}
export async function putFiscal(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx); const v = parseBody(fiscalIn, ctx.body);
  const current = await ctx.db.from('company_fiscal_settings').select('dps_series,print_danfse_receipt').eq('company_id', c.id).maybeSingle(); if (current.error) throw new Error('FISCAL_READ_FAILED');
  const { dps_series: _ignored, company_id, organization_id, ...fields } = fiscalToDb(v, { company_id: c.id, organization_id: ctx.organization_id }, current.data?.dps_series ?? null,current.data?.print_danfse_receipt??false);
  const profiles=await ctx.db.from('company_service_profiles').select('iss_taxation').eq('company_id',c.id).eq('organization_id',ctx.organization_id).eq('active',true);
  if(profiles.error)throw new Error('FISCAL_READ_FAILED');for(const p of profiles.data??[]){const error=specialTaxRuleError(fields.simples_nacional_option,fields.simples_nacional_regime,fields.special_tax_regime,p.iss_taxation);if(error)throw fail(422,'REGRA_DE_NEGOCIO',[{campo:'regime_especial',mensagem:error}]);}
  const r = current.data
    ? await ctx.db.from('company_fiscal_settings').update({ ...fields, ...apiAudit(ctx) } as never).eq('company_id', company_id).eq('organization_id', organization_id).select('*').single()
    : await ctx.db.from('company_fiscal_settings').insert({ ...fields, company_id, organization_id, cnpj: '', dps_series: null as unknown as number, created_by: ctx.actor, ...apiAudit(ctx) } as never).select('*').single();
  if (r.error) fiscalWriteError(r.error);
  refresh(ctx, c.id); return { status: 200, body: fiscalOut(r.data as unknown as FiscalRow) };
}

// ---------- Certificado ----------
export async function getCertificate(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx); const r = await ctx.db.from('company_certificates').select('holder,cnpj,issuer,serial_number,valid_from,valid_until,status').eq('company_id', c.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1);
  if (r.error) throw new Error('CERT_READ_FAILED'); if (!r.data?.length) throw fail(404, 'NAO_ENCONTRADO', [], 'A empresa não tem certificado ativo.');
  return { status: 200, body: certificateOut(r.data[0]!) };
}
export function decodeCertificate(b64: string) {
  let bin: string; try { bin = atob(b64.replace(/\s+/g, '')); } catch { throw fail(422, 'CERTIFICADO_SENHA_OU_ARQUIVO_INVALIDO'); }
  if (bin.length === 0) throw fail(422, 'CERTIFICADO_SENHA_OU_ARQUIVO_INVALIDO');
  if (bin.length > MAX_CERTIFICATE_BYTES) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'arquivo_base64', mensagem: 'O arquivo pode ter no máximo 100 KB.' }]);
  return btoa(bin);
}
export async function postCertificate(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx); const v = parseBody(certificateIn, ctx.body); const pfx = decodeCertificate(v.arquivo_base64);
  const { callTransmissor, TransmissorError } = await import('./transmissor.server');
  const audit = (result: string) => ctx.db.from('certificate_audit_events').insert({ company_id: c.id, organization_id: c.organization_id, user_id: ctx.actor, action: 'failed', purpose: `envio de certificado pela API (integração ${ctx.integration_name})`, result });
  type Prepared = { metadados: { titular: string; cnpj: string; emissor: string; numero_serie: string; valido_de: string; valido_ate: string }; envelope: { versao_chave: string; nonce: string; dados: string } };
  let prepared: Prepared;
  try { prepared = await callTransmissor<Prepared>('/v1/certificados/preparar', { organizacao_id: c.organization_id, empresa_id: c.id, cnpj_esperado: c.cnpj, pfx_base64: pfx, senha: v.senha }); }
  catch (e) { const code = e instanceof TransmissorError ? e.code : 'INDISPONIVEL'; await audit(code); const mapped = transmissorToContract[code]; if (mapped) throw fail(422, mapped); throw new Error('TRANSMISSOR_UNAVAILABLE'); }
  const m = prepared.metadados;
  const r = await ctx.db.rpc('replace_company_certificate', { _company_id: c.id, _organization_id: c.organization_id, _user_id: ctx.actor, _holder: m.titular, _cnpj: m.cnpj, _issuer: m.emissor, _serial: m.numero_serie, _valid_from: m.valido_de, _valid_until: m.valido_ate, _key_version: prepared.envelope.versao_chave, _nonce: prepared.envelope.nonce, _data: prepared.envelope.dados });
  if (r.error) { await audit('ERRO_GRAVACAO'); if (/CNPJ/.test(r.error.message)) throw fail(422, 'CERTIFICADO_CNPJ_DIVERGENTE'); throw new Error('CERT_WRITE_FAILED'); }
  refresh(ctx, c.id);
  return { status: 200, body: certificateOut({ holder: m.titular, cnpj: m.cnpj, issuer: m.emissor, serial_number: m.numero_serie, valid_from: m.valido_de, valid_until: m.valido_ate, status: 'active' }) };
}

// ---------- Serviços ----------
const ibsCbsRuleMessages = new Set<string>(Object.values(IBSCBS_MESSAGES));
/** atividade_simples only for ME/EPP (opSimpNac 3). */
async function checkSimplesActivity(ctx: ApiCtx, companyId: string, activity: string | null | undefined) {
  if (!activity) return; const f = await ctx.db.from('company_fiscal_settings').select('simples_nacional_option').eq('company_id', companyId).eq('organization_id', ctx.organization_id).maybeSingle();
  if (f.error) throw new Error('FISCAL_READ_FAILED'); if (f.data?.simples_nacional_option !== 3) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'classificacao_ibscbs.atividade_simples', mensagem: IBSCBS_MESSAGES.simplesActivityForbidden }]);
}
const SERVICE_SELECT = '*, service_codes(description), ibscbs_classifications(*), ibscbs_operation_indicators(code,active)';
function serviceWriteError(e: { code?: string; message: string }): never {
  if(/E017[245]/.test(e.message))throw fail(422,'REGRA_DE_NEGOCIO',[{campo:'tributacao_iss',mensagem:e.message}]);
  if (e.code === '23505') throw fail(409, 'ID_EXTERNO_DUPLICADO');
  if (e.code === '23503') throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'codigo_servico', mensagem: 'Use códigos existentes nos catálogos oficiais.' }]);
  if (e.code === 'P0001' && ibsCbsRuleMessages.has(e.message)) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: /atividade/.test(e.message) ? 'classificacao_ibscbs.atividade_simples' : /indicador/.test(e.message) ? 'classificacao_ibscbs.indicador_operacao' : 'classificacao_ibscbs.codigo_classificacao', mensagem: e.message }]);
  if (e.code === '23514' || e.code === 'P0001') throw fail(422, 'REGRA_DE_NEGOCIO');
  throw new Error('SERVICE_WRITE_FAILED');
}
export async function listServices(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx); const { limite, offset } = pageParams(ctx.url);
  const r = await ctx.db.from('company_service_profiles').select(SERVICE_SELECT).eq('company_id', c.id).order('created_at', { ascending: false }).order('id').range(offset, offset + limite);
  if (r.error) throw new Error('SERVICE_LIST_FAILED'); return { status: 200, body: page((r.data as unknown as ServiceRow[]).map(serviceOut), limite, offset) };
}
export async function createService(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx); const v = parseBody(serviceCreate, ctx.body); const row = serviceToDb(v, {}); await checkSimplesActivity(ctx, c.id, row.simples_activity_code);
  const r = await ctx.db.from('company_service_profiles').insert({ ...row, company_id: c.id, organization_id: ctx.organization_id, created_by: ctx.actor, ...apiAudit(ctx) } as never).select(SERVICE_SELECT).single();
  if (r.error) serviceWriteError(r.error); refresh(ctx, c.id); return { status: 201, body: serviceOut(r.data as unknown as ServiceRow) };
}
async function loadService(ctx: ApiCtx, companyId: string) {
  const id = idParam(ctx.params['servicoId'], 'servico_id');
  const r = await ctx.db.from('company_service_profiles').select(SERVICE_SELECT).eq('id', id).eq('company_id', companyId).eq('organization_id', ctx.organization_id).maybeSingle();
  if (r.error) throw new Error('SERVICE_READ_FAILED'); if (!r.data) throw fail(404, 'NAO_ENCONTRADO'); return r.data as unknown as ServiceRow;
}
export async function getService(ctx: ApiCtx): Promise<ApiResult> { const c = await loadCompany(ctx); return { status: 200, body: serviceOut(await loadService(ctx, c.id)) }; }
export async function patchService(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx); const current = await loadService(ctx, c.id); const v = parseBody(servicePatch, ctx.body); const row = serviceToDb(v, current); if (row.simples_activity_code !== current.simples_activity_code) await checkSimplesActivity(ctx, c.id, row.simples_activity_code);
  const r = await ctx.db.from('company_service_profiles').update({ ...row, ...apiAudit(ctx) } as never).eq('id', current.id).eq('organization_id', ctx.organization_id).select(SERVICE_SELECT).single();
  if (r.error) serviceWriteError(r.error); refresh(ctx, c.id); return { status: 200, body: serviceOut(r.data as unknown as ServiceRow) };
}

// ---------- Situação ----------
export async function getSituation(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx); const { loadReadiness } = await import('./readiness.server');
  const { readiness: { pendencias: _p, ...body } } = await loadReadiness(ctx.db, c.id, ctx.env); return { status: 200, body };
}
export async function verifyMunicipality(ctx: ApiCtx): Promise<ApiResult> {
  const c = await loadCompany(ctx);
  const last = await ctx.db.from('municipality_agreement_queries').select('created_at').eq('company_id', c.id).eq('environment', ctx.env).order('created_at', { ascending: false }).limit(1);
  const lastAt = last.data?.[0]?.created_at;
  if (lastAt) { const wait = Date.parse(lastAt) + AGREEMENT_COOLDOWN_MS - Date.now(); if (wait > 0) { const e = fail(429, 'LIMITE_EXCEDIDO', [], 'Aguarde 1 minuto entre verificações do município para esta empresa e ambiente.'); e.headers = { 'Retry-After': String(Math.ceil(wait / 1000)) }; throw e; } }
  const certs = await ctx.db.from('company_certificates').select('status,cnpj,valid_from,valid_until').eq('company_id', c.id);
  if (!(certs.data ?? []).some(x => validReadinessCertificate(x, c.cnpj))) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'certificado', mensagem: 'Envie um certificado válido antes de verificar o município.' }]);
  const material = await ctx.db.from('company_certificate_material').select('key_version, nonce, data').eq('company_id', c.id).maybeSingle();
  if (!material.data) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'certificado', mensagem: 'Envie o certificado novamente.' }]);
  const { callTransmissor, TransmissorError } = await import('./transmissor.server');
  const row: { [k: string]: unknown; url?: unknown; error_code?: unknown; response_body?: unknown; duration_ms?: unknown; http_status?: unknown } = { company_id: c.id, organization_id: c.organization_id, municipality_ibge_code: c.municipality_ibge_code, environment: ctx.env, requested_by: ctx.actor };
  type Res = { url?: string; resposta?: { status: number; corpo: string; ms?: number } | { erro: string; detalhe?: string; ms?: number } };
  try {
    const res = await callTransmissor<Res>('/v1/municipios/convenio', { organizacao_id: c.organization_id, empresa_id: c.id, envelope: { versao_chave: material.data.key_version, nonce: material.data.nonce, dados: material.data.data }, codigo_municipio: c.municipality_ibge_code, ambiente: toTransmissorEnvironment(ctx.env) });
    row.url = res.url ?? null; const r = res.resposta;
    if (r && 'erro' in r) { row.error_code = r.erro; row.response_body = r.detalhe ?? null; row.duration_ms = r.ms ?? null; } else if (r) { row.http_status = r.status; row.response_body = r.corpo; row.duration_ms = r.ms ?? null; }
  } catch (e) { row.error_code = e instanceof TransmissorError ? e.code : 'INDISPONIVEL'; }
  await ctx.db.from('municipality_agreement_queries').insert(row as never);
  await ctx.db.from('certificate_audit_events').insert({ company_id: c.id, organization_id: c.organization_id, user_id: ctx.actor, action: row.error_code ? 'failed' : 'used', purpose: `consulta de convênio municipal pela API (integração ${ctx.integration_name})`, environment: ctx.env, result: String(row.error_code ?? row.http_status ?? '') });
  refresh(ctx, c.id);
  const { loadReadiness } = await import('./readiness.server'); const { readiness: { pendencias: _p, ...body } } = await loadReadiness(ctx.db, c.id, ctx.env);
  return { status: 200, body };
}

// ---------- Catálogos ----------
export async function catalog(ctx: ApiCtx, kind: 'municipios' | 'servicos' | 'nbs' | 'classificacoes' | 'indicadores'): Promise<ApiResult> {
  const { limite, offset } = pageParams(ctx.url); const busca = searchParam(ctx.url);
  if (kind === 'classificacoes') {
    const r = busca ? await ctx.db.rpc('search_fiscal_catalog', { _catalog: 'ibscbs_classifications', _search: busca }).range(offset, offset + limite) : await ctx.db.from('ibscbs_classifications').select('*').order('code').range(offset, offset + limite);
    if (r.error) throw new Error('CATALOG_FAILED');
    const rows = busca ? (r.data as { code: string; details: Record<string, unknown> }[]).map(x => ({ ...(x.details as unknown as IbsCbsClassification), code: x.code })) : (r.data as unknown as IbsCbsClassification[]);
    return { status: 200, body: page(rows.map(classificationOut), limite, offset) };
  }
  if (kind === 'indicadores') {
    const inactive = ctx.url.searchParams.get('incluir_inativos') === 'true';
    let q = ctx.db.from('ibscbs_operation_indicators').select('*').order('code'); if (!inactive) q = q.eq('active', true);
    if (busca) q = q.or(`code.like.${busca.replace(/[^0-9]/g, '') || '_'}%,location_to_identify.ilike.%${busca.replace(/[%,()*]/g, ' ')}%`);
    const r = await q.range(offset, offset + limite); if (r.error) throw new Error('CATALOG_FAILED');
    return { status: 200, body: page((r.data ?? []).map(x => ({ codigo: x.code, ativo: x.active, tipo_operacao: x.operation_type, local_operacao: x.operation_location, caracteristica_fornecimento: x.supply_characteristic, local_identificar: x.location_to_identify, localidade_incidencia: x.incidence_location ?? null })), limite, offset) };
  }
  if (kind === 'municipios') {
    const r = busca ? await ctx.db.rpc('search_municipality_catalog', { search_term: municipalitySearchTerm(busca).term }).range(offset, offset + limite) : await ctx.db.from('municipalities').select('*').order('name').range(offset, offset + limite);
    if (r.error) throw new Error('CATALOG_FAILED');
    return { status: 200, body: page((r.data ?? []).map(m => ({ codigo: m.ibge_code, nome: m.name, uf: m.state })), limite, offset) };
  }
  const table = kind === 'servicos' ? 'service_codes' : 'nbs_codes';
  const r = busca ? await ctx.db.rpc('search_fiscal_catalog', { _catalog: table, _search: busca }).range(offset, offset + limite) : await ctx.db.from(table).select('code,description').order('code').range(offset, offset + limite);
  if (r.error) throw new Error('CATALOG_FAILED');
  return { status: 200, body: page(((r.data ?? []) as { code: string; description: string }[]).map(x => ({ codigo: x.code, descricao: x.description })), limite, offset) };
}

const classificationOut = (c: IbsCbsClassification) => ({ codigo: c.code, cst: c.cst, descricao_cst: c.cst_description ?? null, descricao: c.description ?? null, exige_tributacao: c.requires_taxation, percentual_reducao_ibs: c.ibs_reduction_percent === undefined ? null : String(c.ibs_reduction_percent), percentual_reducao_cbs: c.cbs_reduction_percent === undefined ? null : String(c.cbs_reduction_percent), suportada: unsupportedClassificationReason(c) === null, motivo_nao_suportada: unsupportedClassificationReason(c) });
/** GET /catalogos/sugestao-classificacao?codigo_servico= — Anexo VIII suggestion, never applied automatically. */
export async function ibsCbsSuggestion(ctx: ApiCtx): Promise<ApiResult> {
  const code = (ctx.url.searchParams.get('codigo_servico') ?? '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'codigo_servico', mensagem: 'Informe o código de tributação nacional com 6 dígitos.' }]);
  const { loadIbsCbsSuggestion } = await import('./ibscbs.server');
  const s = await loadIbsCbsSuggestion(ctx.db, code); if (!s) throw fail(404, 'NAO_ENCONTRADO', [], 'A tabela oficial de correlação não tem sugestão para este serviço.');
  return { status: 200, body: { codigo_servico: code, ...s } };
}

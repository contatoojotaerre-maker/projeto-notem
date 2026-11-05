import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { MAX_CERTIFICATE_BYTES, AGREEMENT_COOLDOWN_MS, toTransmissorEnvironment, translateTransmissorError, stripSensitive } from './certificates';

type Ctx = { supabase: any; userId: string };
const ids = z.object({ company_id: z.string().uuid(), organization_id: z.string().uuid() });

async function authorizeUse(ctx: Ctx, company_id: string, organization_id: string) {
  const [admin, role] = await Promise.all([ctx.supabase.rpc('is_platform_admin'), ctx.supabase.rpc('has_org_role', { org_id: organization_id, roles: ['owner', 'admin'] })]);
  if (!admin.data && !role.data) throw new Error('Acesso não autorizado.');
  const company = await ctx.supabase.from('companies').select('id, organization_id, cnpj, municipality_ibge_code').eq('id', company_id).eq('organization_id', organization_id).single();
  if (company.error) throw new Error('Empresa não encontrada ou acesso não autorizado.');
  return company.data as { id: string; organization_id: string; cnpj: string; municipality_ibge_code: string };
}

export const getCertificates = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(ids).handler(async ({ context, data }) => {
  const r = await context.supabase.from('company_certificates').select('id, holder, cnpj, issuer, serial_number, valid_from, valid_until, status, created_at, replaced_at').eq('company_id', data.company_id).eq('organization_id', data.organization_id).order('created_at', { ascending: false });
  if (r.error) throw new Error('Não foi possível carregar os certificados.');
  return r.data ?? [];
});

type Prepared = { metadados: { titular: string; cnpj: string; emissor: string; numero_serie: string; valido_de: string; valido_ate: string }; envelope: { versao_chave: string; nonce: string; dados: string } };

export const uploadCertificate = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => {
  if (!(input instanceof FormData)) throw new Error('Envio inválido.');
  const file = input.get('file'); const password = input.get('password');
  const parsed = ids.parse({ company_id: input.get('company_id'), organization_id: input.get('organization_id') });
  if (!(file instanceof File) || typeof password !== 'string' || !password) throw new Error('Selecione o arquivo e informe a senha.');
  if (!/\.(pfx|p12)$/i.test(file.name)) throw new Error('Envie um arquivo .pfx ou .p12.');
  if (file.size > MAX_CERTIFICATE_BYTES) throw new Error('O arquivo pode ter no máximo 100 KB.');
  return { ...parsed, file, password };
}).handler(async ({ context, data }) => {
  const company = await authorizeUse(context, data.company_id, data.organization_id);
  const { callTransmissor, bytesToBase64, TransmissorError } = await import('./transmissor.server');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const audit = (result: string) => supabaseAdmin.from('certificate_audit_events').insert({ company_id: company.id, organization_id: company.organization_id, user_id: context.userId, action: 'failed', purpose: 'envio de certificado', result });
  let prepared: Prepared;
  try {
    prepared = await callTransmissor<Prepared>('/v1/certificados/preparar', { organizacao_id: company.organization_id, empresa_id: company.id, cnpj_esperado: company.cnpj.replace(/\D/g, ''), pfx_base64: bytesToBase64(new Uint8Array(await data.file.arrayBuffer())), senha: data.password });
  } catch (e) {
    const code = e instanceof TransmissorError ? e.code : 'INDISPONIVEL';
    await audit(code); throw new Error(translateTransmissorError(code));
  }
  const m = prepared.metadados;
  const r = await supabaseAdmin.rpc('replace_company_certificate', { _company_id: company.id, _organization_id: company.organization_id, _user_id: context.userId, _holder: m.titular, _cnpj: m.cnpj, _issuer: m.emissor, _serial: m.numero_serie, _valid_from: m.valido_de, _valid_until: m.valido_ate, _key_version: prepared.envelope.versao_chave, _nonce: prepared.envelope.nonce, _data: prepared.envelope.dados });
  if (r.error) { console.error('certificate: replace failed', r.error.code); await audit('ERRO_GRAVACAO'); throw new Error('Não foi possível guardar o certificado. O anterior foi mantido.'); }
  { const { panelRefreshReadiness } = await import('./notem.functions'); await panelRefreshReadiness(company.id); }
  return stripSensitive({ holder: m.titular, cnpj: m.cnpj, issuer: m.emissor, serial_number: m.numero_serie, valid_from: m.valido_de, valid_until: m.valido_ate });
});

export const getAgreementQueries = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(ids.extend({ environment: z.enum(['production', 'sandbox']) })).handler(async ({ context, data }) => {
  const r = await context.supabase.from('municipality_agreement_queries').select('id, municipality_ibge_code, environment, http_status, response_body, error_code, url, duration_ms, created_at').eq('company_id', data.company_id).eq('organization_id', data.organization_id).eq('environment', data.environment).order('created_at', { ascending: false }).limit(1);
  if (r.error) throw new Error('Não foi possível carregar a consulta.');
  return r.data?.[0] ?? null;
});

type AgreementResult = { url?: string; resposta?: { status: number; tipo_conteudo?: string; corpo: string; ms?: number } | { erro: string; detalhe?: string; ms?: number } };

export const checkAgreement = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(ids).handler(async ({ context, data }) => {
  const company = await authorizeUse(context, data.company_id, data.organization_id);
  const profile = await context.supabase.from('profiles').select('environment').eq('id', context.userId).single();
  const environment = (profile.data?.environment ?? 'production') as 'production' | 'sandbox';
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const last = await supabaseAdmin.from('municipality_agreement_queries').select('created_at').eq('company_id', company.id).eq('environment', environment).order('created_at', { ascending: false }).limit(1);
  const lastAt = last.data?.[0]?.created_at;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < AGREEMENT_COOLDOWN_MS) throw new Error(`Aguarde para verificar novamente. Próxima verificação a partir de ${new Date(new Date(lastAt).getTime() + AGREEMENT_COOLDOWN_MS).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`);
  const material = await supabaseAdmin.from('company_certificate_material').select('key_version, nonce, data').eq('company_id', company.id).eq('organization_id', company.organization_id).maybeSingle();
  if (!material.data) throw new Error('Envie o certificado da empresa antes de verificar.');
  const { callTransmissor, TransmissorError } = await import('./transmissor.server');
  const row: { [k: string]: unknown; url?: unknown; error_code?: unknown; response_body?: unknown; duration_ms?: unknown; http_status?: unknown } = { company_id: company.id, organization_id: company.organization_id, municipality_ibge_code: company.municipality_ibge_code, environment, requested_by: context.userId };
  try {
    const res = await callTransmissor<AgreementResult>('/v1/municipios/convenio', { organizacao_id: company.organization_id, empresa_id: company.id, envelope: { versao_chave: material.data.key_version, nonce: material.data.nonce, dados: material.data.data }, codigo_municipio: company.municipality_ibge_code, ambiente: toTransmissorEnvironment(environment) });
    row.url = res.url ?? null;
    const r = res.resposta;
    if (r && 'erro' in r) { row.error_code = r.erro; row.response_body = r.detalhe ?? null; row.duration_ms = r.ms ?? null; }
    else if (r) { row.http_status = r.status; row.response_body = r.corpo; row.duration_ms = r.ms ?? null; }
  } catch (e) { row.error_code = e instanceof TransmissorError ? e.code : 'INDISPONIVEL'; }
  await supabaseAdmin.from('municipality_agreement_queries').insert(row as never);
  await supabaseAdmin.from('certificate_audit_events').insert({ company_id: company.id, organization_id: company.organization_id, user_id: context.userId, action: row.error_code ? 'failed' : 'used', purpose: 'consulta de convênio municipal', environment, result: String(row.error_code ?? row.http_status ?? '') });
  { const { panelRefreshReadiness } = await import('./notem.functions'); await panelRefreshReadiness(company.id); }
  return { ok: !row.error_code, message: row.error_code ? translateTransmissorError(String(row.error_code)) : null };
});

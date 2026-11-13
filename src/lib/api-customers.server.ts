import type { Json } from '@/integrations/supabase/types';
import { customerCreate, customerSchema, customerOutput } from './customers';
import { fail, parseBody, pageParams, page, isoBr } from './api-contract';
import { loadCompany, type ApiCtx } from './api.server';

async function catalog(ctx: ApiCtx, data: ReturnType<typeof customerSchema.parse>) {
  const e = data.endereco; if (!e) return;
  if (e.codigo_municipio) { const r = await ctx.db.from('municipalities').select('ibge_code').eq('ibge_code', e.codigo_municipio).maybeSingle(); if (r.error) throw new Error('CUSTOMER_CATALOG_FAILED'); if (!r.data) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'endereco.codigo_municipio', mensagem: 'Município não encontrado no catálogo oficial.' }]); }
  if (e.pais) { const r = await ctx.db.from('countries').select('iso2').eq('iso2', e.pais).maybeSingle(); if (r.error) throw new Error('CUSTOMER_CATALOG_FAILED'); if (!r.data) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'endereco.pais', mensagem: 'País não encontrado no catálogo oficial.' }]); }
}
const output = (r: Parameters<typeof customerOutput>[0]) => ({ ...customerOutput(r), criada_em: isoBr(r.created_at), atualizada_em: isoBr(r.updated_at) });
export async function listCustomers(ctx: ApiCtx) {
  const c = await loadCompany(ctx); const { limite, offset } = pageParams(ctx.url);
  let q = ctx.db.from('company_customers').select('*').eq('company_id', c.id).eq('organization_id', ctx.organization_id);
  for (const k of ['documento', 'id_externo', 'busca']) { const v = ctx.url.searchParams.get(k); if (!v) continue; if (v.length > 150) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: k, mensagem: 'Filtro muito longo.' }]); if (k === 'documento') q = q.eq('customer_data->>documento', v); if (k === 'id_externo') q = q.eq('external_id', v); if (k === 'busca') q = q.ilike('customer_data->>nome', `%${v.replace(/[%_\\]/g, '\\$&')}%`); }
  const r = await q.order('created_at', { ascending: false }).order('id').range(offset, offset + limite); if (r.error) throw new Error('CUSTOMERS_READ_FAILED'); return { status: 200, body: page((r.data ?? []).map(output), limite, offset) };
}
async function find(ctx: ApiCtx) {
  const c = await loadCompany(ctx); const id = ctx.params['customerId']; if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw fail(404, 'NAO_ENCONTRADO');
  const r = await ctx.db.from('company_customers').select('*').eq('id', id).eq('company_id', c.id).eq('organization_id', ctx.organization_id).maybeSingle(); if (r.error) throw new Error('CUSTOMER_READ_FAILED'); if (!r.data) throw fail(404, 'NAO_ENCONTRADO'); return r.data;
}
export async function getCustomer(ctx: ApiCtx) { return { status: 200, body: output(await find(ctx)) }; }
export async function saveCustomer(ctx: ApiCtx, patch = false) {
  const c = await loadCompany(ctx); const prior = patch ? await find(ctx) : null;
  const raw = parseBody(customerCreate, ctx.body); const { id_externo, ...fields } = raw;
  const old = prior ? customerSchema.parse(prior.customer_data) : null;
  const data = parseBody(customerSchema, old ? { ...old, ...fields, ...(fields['endereco'] && typeof fields['endereco'] === 'object' ? { endereco: { ...old.endereco, ...fields['endereco'] } } : {}) } : fields); await catalog(ctx, data);
  const values = { customer_data: data as Json, external_id: id_externo === undefined ? prior?.external_id ?? null : id_externo, updated_by: ctx.actor, changed_by_integration_id: ctx.integration_id, change_origin: 'api' as const };
  const r = prior ? await ctx.db.from('company_customers').update(values).eq('id', prior.id).eq('company_id', c.id).eq('organization_id', ctx.organization_id).select().single() : await ctx.db.from('company_customers').insert({ ...values, company_id: c.id, organization_id: ctx.organization_id, created_by: ctx.actor }).select().single();
  if (r.error) { if (r.error.code === '23505') throw fail(409, 'ID_EXTERNO_DUPLICADO', [{ campo: 'id_externo', mensagem: 'Já existe um tomador com este id_externo nesta empresa.' }]); throw new Error('CUSTOMER_WRITE_FAILED'); } return { status: prior ? 200 : 201, body: output(r.data) };
}
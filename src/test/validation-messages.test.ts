// @vitest-environment node
/**
 * Snapshot of validation error responses (API, server side) and panel form messages.
 * Rule: every message a partner or user sees is Portuguese and controlled by notem.
 * Regenerate deliberately with UPDATE_VALIDATION_SNAPSHOT=1 and explain every difference.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiFailure, certificateIn, companyCreate, companyPatch, fiscalIn, fiscalToDb, parseBody, serviceCreate, servicePatch } from '@/lib/api-contract';
import { invoiceRequest } from '@/lib/invoices';
import { customerCreate, customerSchema } from '@/lib/customers';
import { eventBody } from '@/lib/fiscal-events.server';
import { loadCompany } from '@/lib/api.server';
import { createCompany } from '@/lib/api-companies.server';
import { apiCtx, tableDb } from './fake-db';
import { runFormCases } from './validation-cases';

const SNAPSHOT = resolve(__dirname, 'validation-messages.snapshot.json');
const U = '10000000-0000-4000-8000-000000000001', OLD = '00000000-0000-0000-0000-000000000001', long = 'x'.repeat(3000);
const addr = { cep: '88000000', logradouro: 'Rua', numero: '1', bairro: 'Centro', codigo_municipio: '4205407' };
const comp = { cnpj: '11222333000181', razao_social: 'Empresa', endereco: addr };
const inv = { empresa_id: U, servico_id: U, valores: { servico: '10.00' } };
const cust = { tipo: 'pj', documento: '11222333000181', nome: 'Tomador' };
const fisc = { simples_nacional: 'mei', regime_especial: 'nenhum', tributos_aproximados: { modo: 'nao_informar' } };
const svc = { nome: 'Serviço', ativo: true, codigo_servico: '010501', tributacao_iss: 'tributavel', retencao_iss: 'nao_retido' };
const longKey = 'campo_com_nome_muito_longo_'.repeat(5);
const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`extra_${String(i + 1).padStart(2, '0')}`, i]));

type Out = { status: number; codigo: string; detalhes: unknown } | 'OK';
const asOut = (e: unknown): Out => { if (e instanceof ApiFailure) return { status: e.status, codigo: e.code, detalhes: e.details }; throw e; };
const body = (schema: Parameters<typeof parseBody>[0], v: unknown): Out => { try { parseBody(schema, v); return 'OK'; } catch (e) { return asOut(e); } };
const run = async (f: () => Promise<unknown>): Promise<Out> => { try { await f(); return 'OK'; } catch (e) { return asOut(e); } };

const bodyCases: [string, Parameters<typeof parseBody>[0], unknown][] = [
  ['empresa: corpo vazio', companyCreate, {}], ['empresa: corpo lista', companyCreate, []], ['empresa: corpo nulo', companyCreate, null],
  ['empresa: tipo errado', companyCreate, { ...comp, razao_social: 5 }], ['empresa: booleano como texto', companyCreate, { ...comp, ativa: 'sim' }],
  ['empresa: campo desconhecido', companyCreate, { ...comp, x: 1 }], ['empresa: nome de campo desconhecido muito longo', companyCreate, { ...comp, [longKey]: 1 }],
  ['empresa: 20 campos desconhecidos', companyCreate, { ...comp, ...twenty }], ['empresa: campo desconhecido no endereço', companyCreate, { ...comp, endereco: { ...addr, uf: 'SC' } }],
  ['empresa: e-mail inválido (mensagem da notem)', companyCreate, { ...comp, email: 'a@' }], ['empresa: e-mail com + e .com.br', companyCreate, { ...comp, email: 'financeiro+notas@grupo.com.br' }],
  ['empresa: texto longo', companyCreate, { ...comp, razao_social: long }], ['empresa: texto vazio', companyCreate, { ...comp, razao_social: ' ' }],
  ['empresa: CEP (mensagem da notem)', companyCreate, { ...comp, endereco: { ...addr, cep: '1' } }], ['empresa: CNPJ inválido (mensagem da notem)', companyCreate, { ...comp, cnpj: '11222333000182' }],
  ['empresa PATCH: campo desconhecido', companyPatch, { y: 1 }], ['empresa PATCH: id_externo vazio', companyPatch, { id_externo: '' }],
  ['configuração fiscal: vazia', fiscalIn, {}], ['configuração fiscal: opção inválida', fiscalIn, { ...fisc, simples_nacional: 'x' }],
  ['configuração fiscal: campo desconhecido', fiscalIn, { ...fisc, z: 1 }], ['configuração fiscal: percentual (mensagem da notem)', fiscalIn, { ...fisc, tributos_aproximados: { modo: 'percentual_simples', percentual_simples: '1,5' } }],
  ['serviço: vazio', serviceCreate, {}], ['serviço: campo desconhecido', serviceCreate, { ...svc, k: 1 }], ['serviço PATCH: nome longo', servicePatch, { nome: 'x'.repeat(201) }],
  ['serviço: código (mensagem da notem)', serviceCreate, { ...svc, codigo_servico: '1' }],
  ['certificado: vazio', certificateIn, {}], ['certificado: senha longa', certificateIn, { arquivo_base64: 'AA==', senha: long }],
  ['nota: vazia', invoiceRequest, {}], ['nota: UUID inválido', invoiceRequest, { ...inv, empresa_id: 'abc' }], ['nota: UUID fora do padrão', invoiceRequest, { ...inv, empresa_id: OLD }],
  ['nota: opção inválida', invoiceRequest, { ...inv, retencao_iss: 'x' }], ['nota: campo desconhecido', invoiceRequest, { ...inv, extra: 1 }],
  ['nota: campo desconhecido + regra da notem', invoiceRequest, { ...inv, extra: 1, empresa_id_externo: 'e' }], ['nota: campo desconhecido em valores', invoiceRequest, { ...inv, valores: { servico: '10.00', x: 1 } }],
  ['nota: valor como número', invoiceRequest, { ...inv, valores: { servico: 10 } }], ['nota: valor sem duas casas (mensagem da notem)', invoiceRequest, { ...inv, valores: { servico: '10' } }],
  ['nota: descrição longa', invoiceRequest, { ...inv, descricao: long }], ['nota: competência em formato errado', invoiceRequest, { ...inv, competencia: '2026-1-1' }],
  ['nota: tomador com e-mail inválido (mensagem da notem)', invoiceRequest, { ...inv, tomador: { ...cust, email: 'x' } }], ['nota: tomador com campo desconhecido', invoiceRequest, { ...inv, tomador: { ...cust, q: 1 } }],
  ['nota: tomador com tipo inválido', invoiceRequest, { ...inv, tomador: { ...cust, tipo: 'z' } }], ['nota: local sem 7 dígitos', invoiceRequest, { ...inv, local_prestacao: { codigo_municipio: '1' } }],
  ['tomador: vazio', customerSchema, {}], ['tomador: e-mail com subdomínio', customerSchema, { ...cust, email: 'contato@sub.dominio.com.br' }], ['tomador POST: id_externo vazio', customerCreate, { id_externo: '' }],
  ['cancelamento: vazio', eventBody, {}], ['cancelamento: campo desconhecido', eventBody, { motivo: 'outros', justificativa: 'a', x: 1 }],
];

async function snapshot() {
  const api: Record<string, Out> = {};
  for (const [n, s, v] of bodyCases) api[n] = body(s, v);
  api['configuração fiscal: regra E0712 convertida (mensagem da notem)'] = await run(async () => fiscalToDb({ ...fisc, simples_nacional: 'me_epp', regime_apuracao_simples: 'dentro_do_simples' } as never, { company_id: U, organization_id: U }, null));
  api['servidor: POST /empresas pelo manipulador da API'] = await run(() => createCompany(apiCtx(tableDb({}).db, { ...comp, razao_social: 5, x: 1 }, '/api/v1/empresas') as never));
  for (const [n, id] of [['caminho: /empresas/abc', 'abc'], ['caminho: /empresas/{UUID fora do padrão}', OLD], ['caminho: /empresas/{UUID válido inexistente}', U]] as const)
    api[n] = await run(() => loadCompany(apiCtx(tableDb({ companies: null }).db, {}, `/api/v1/empresas/${id}`, { id }) as never));
  return { api, formularios: runFormCases() };
}

describe('retrato das mensagens de validação', () => {
  it('é idêntico ao retrato guardado', async () => {
    const now = await snapshot();
    if (process.env['UPDATE_VALIDATION_SNAPSHOT'] === '1' || !existsSync(SNAPSHOT)) writeFileSync(SNAPSHOT, JSON.stringify(now, null, 2) + '\n');
    const saved = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as typeof now;
    expect(now.api).toEqual(saved.api);
    expect(now.formularios).toEqual(saved.formularios);
  });
});

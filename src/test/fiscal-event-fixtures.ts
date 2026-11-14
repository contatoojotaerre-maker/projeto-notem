import type { FiscalEventInput } from '../lib/fiscal-events';
import type { DpsInput } from '../lib/dps';
import { fixture } from './dps-fixtures';
/** Fictitious key with the layout of the provider 11222333000181 in 4212254 (DV not official). */
export const exampleKey = '4212254' + '2' + '2' + '11222333000181' + '0000000000001' + '2611' + '123456789' + '0';
export function eventFixture(code: FiscalEventInput['code'] = '101101'): FiscalEventInput {
  return { code, environment: 'sandbox', accessKey: exampleKey, authorCnpj: '11222333000181', occurredAt: '2026-11-14T18:30:00-03:00', reason: 'erro_emissao', justification: 'Valor do serviço informado incorretamente na emissão.' };
}
export function substituteFixture(): DpsInput {
  const v = fixture(); v.number = '4'; v.emittedAt = '2026-11-14T18:30:00-03:00'; v.competence = '2026-11-12';
  v.substitution = { accessKey: exampleKey, reason: 'outros', justification: 'Correção da descrição do serviço prestado ao tomador.' };
  v.service.description = 'Vistoria de demonstração com descrição corrigida';
  return v;
}
export function eventExamples() {
  const analysis = eventFixture('101103'); analysis.reason = 'servico_nao_prestado'; analysis.justification = 'Serviço não foi prestado; cancelamento recusado por prazo municipal.';
  return { cancelamento: eventFixture(), 'analise-fiscal': analysis };
}

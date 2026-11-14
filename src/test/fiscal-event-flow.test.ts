import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callTransmissor, TransmissorError } from '../lib/transmissor.server';
import { applyEventReply, eventResponse, processFiscalEventVerifications, requestFiscalEvent, sendFiscalEvent, type FiscalEvent } from '../lib/fiscal-events.server';
import { substitutionBody, substitutionRuleError, issueSubstitution, apiIssueCtx, cancelInvoice } from '../lib/api-invoices.server';
import { invoiceOut, type Invoice } from '../lib/invoices';
import { buildFiscalEvent } from '../lib/fiscal-events';
import { FISCAL_TEXT_MESSAGE } from '../lib/fiscal-text';
import { exampleKey, eventFixture } from './fiscal-event-fixtures';
import { tableDb, apiCtx, ids } from './fake-db';
vi.mock('../lib/transmissor.server', () => ({ callTransmissor: vi.fn(), TransmissorError: class extends Error { constructor(public code: string, public status?: number) { super(code); } } }));
vi.mock('../lib/readiness.server', () => ({ refreshReadiness: vi.fn(), loadReadiness: vi.fn(async () => ({ readiness: { pronta_para_emitir: true, itens: [] } })) }));

const invoice = (over: Partial<Invoice> = {}) => ({ id: ids.invoice_id, organization_id: ids.organization_id, company_id: ids.company_id, integration_id: ids.integration_id, environment: 'sandbox', status: 'authorized', access_key: exampleKey, nfse_number: '11', provider_snapshot: { cnpj: '11222333000181' }, created_by: 'actor', cancellation: null, pending_operation: null, sent_values: { servico: '150.00' }, service_snapshot: { service_code: '140101', municipal_tax_code: null, withholding: 1 }, service_location: { codigo_municipio: '4212254' }, competence: '2026-11-12', customer_snapshot: { tipo: 'pj', documento: '11444777000161', nome: 'Tomador' }, description: 'Vistoria', complementary_information: null, service_profile_id: ids.profile_id, dps_series: 900, dps_number: 1, emitted_at: '2026-11-13T19:00:00Z', created_at: '2026-11-13T19:00:00Z', updated_at: '2026-11-13T19:00:00Z', ...over } as unknown as Invoice);
const built = buildFiscalEvent(eventFixture());
const event = (over: Partial<FiscalEvent> = {}) => ({ id: '40000000-0000-4000-8000-000000000001', invoice_id: ids.invoice_id, organization_id: ids.organization_id, company_id: ids.company_id, environment: 'sandbox', integration_id: ids.integration_id, origin: 'api', requested_by: 'actor', code: '101101', sequence: 1, reason: 'erro_emissao', justification: 'Valor do serviço informado incorretamente na emissão.', idempotency_key: 'k', request_hash: 'h', request_id: built.id, status: 'sending', unsigned_xml: built.xml, claim_token: 'token', lease_until: '2999-01-01T00:00:00Z', created_at: '2026-11-14T18:00:00Z', verification_started_at: '2026-11-14T18:00:00Z', government_errors: [], ...over } as unknown as FiscalEvent);
const officialXml = (code = '101101') => `<evento xmlns="http://www.sped.fazenda.gov.br/nfse"><infEvento Id="EVT${exampleKey}${code}001"><dhProc>2026-11-14T18:31:00-03:00</dhProc><pedRegEvento><infPedReg><chNFSe>${exampleKey}</chNFSe><e${code}><cMotivo>2</cMotivo><xMotivo>Cancelado no Portal Nacional pelo prestador.</xMotivo></e${code}></infPedReg></pedRegEvento></infEvento></evento>`;
function db(tables: Record<string, unknown> = {}) {
  return tableDb({ invoices: invoice(), company_certificate_material: { key_version: '1', nonce: 'n', data: 'd' }, company_certificates: { cnpj: '11222333000181' }, invoice_fiscal_events: null, ...tables }, (name, args) => {
    if (name === 'finish_fiscal_event') return { data: { ...event(), status: (args['_patch'] as { status: string }).status, claim_token: null }, error: null };
    if (name === 'create_fiscal_event_request') return { data: { created: true, event: event() }, error: null };
    if (name === 'claim_fiscal_event_verifications') return { data: [event({ status: 'verifying' })], error: null };
    return { data: null, error: null };
  });
}
const finish = (f: ReturnType<typeof db>) => f.calls.find(c => c.name === 'finish_fiscal_event')?.args as Record<string, unknown> & { _patch: Record<string, unknown>; _invoice: { cancellation: Record<string, unknown>; pending_operation: unknown } };
const paths = () => vi.mocked(callTransmissor).mock.calls.map(c => c[0]);
beforeEach(() => vi.mocked(callTransmissor).mockReset());

describe('Cancelamento: respostas do governo', () => {
  it('201 com eventoXml: cancelada, XML guardado e nota.cancelada', async () => {
    const f = db(); await applyEventReply(f.db, event(), invoice(), { evento_assinado: 'signed', resposta: { status: 201, corpo_json: { eventoXml: officialXml() } } });
    const a = finish(f); expect(a._patch['status']).toBe('registered'); expect(a._patch['event_xml']).toBe(officialXml()); expect(a['_webhook']).toBe('nota.cancelada'); expect(a['_timeline']).toBe('cancellation_registered'); expect(a._invoice.cancellation['situacao']).toBe('cancelado'); expect((a['_nota'] as { situacao: string }).situacao).toBe('cancelada');
  });
  it('XML de outra nota nunca registra: fica em verificação', async () => {
    const f = db(); await applyEventReply(f.db, event(), invoice(), { resposta: { status: 201, corpo_json: { eventoXml: officialXml().replaceAll(exampleKey, '9'.repeat(50)) } } });
    expect(finish(f)._patch['status']).toBe('verifying');
  });
  for (const code of ['E0822', 'E0823', 'E0824', 'E0827']) it(`${code}: recusa com pode_solicitar_analise`, async () => {
    const f = db(); await applyEventReply(f.db, event(), invoice(), { resposta: { status: 400, corpo_json: { erros: [{ codigo: code, descricao: 'Original' }] } } });
    const a = finish(f); expect(a._patch['status']).toBe('rejected'); expect(a._patch['can_request_analysis']).toBe(true); expect(a._invoice.cancellation['pode_solicitar_analise']).toBe(true);
    expect(a._patch['government_errors']).toEqual([expect.objectContaining({ codigo_governo: code, mensagem_governo: 'Original', pode_solicitar_analise: true })]); expect(a['_webhook']).toBeUndefined();
  });
  it('E0840 com evento encontrado: "Cancelamento registrado fora da notem"', async () => {
    const f = db(); vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 200, corpo_json: { eventoXml: officialXml() } } });
    await applyEventReply(f.db, event(), invoice(), { resposta: { status: 400, corpo_json: { erros: [{ codigo: 'E0840', descricao: 'Já existe evento' }] } } });
    expect(vi.mocked(callTransmissor)).toHaveBeenCalledWith('/v1/nfse/evento/consultar', expect.objectContaining({ chave_acesso: exampleKey, tipo_evento: '101101', num_seq_evento: 1 }));
    const a = finish(f); expect(a._patch).toMatchObject({ status: 'registered', registered_outside: true, event_xml: officialXml() }); expect(a['_timeline']).toBe('cancellation_registered_outside'); expect(a['_message']).toBe('Cancelamento registrado fora da notem.'); expect(a['_webhook']).toBe('nota.cancelada');
    expect(a._invoice.cancellation).toMatchObject({ motivo: 'servico_nao_prestado', justificativa: 'Cancelado no Portal Nacional pelo prestador.', registrado_fora_da_notem: true });
  });
  it('E0840 sem evento encontrado: recusa normal', async () => {
    const f = db(); vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 404 } });
    await applyEventReply(f.db, event(), invoice(), { resposta: { status: 400, corpo_json: { erros: [{ codigo: 'E0840', descricao: 'Evento vinculado' }] } } });
    const a = finish(f); expect(a._patch['status']).toBe('rejected'); expect(a['_webhook']).toBeUndefined(); expect(a._invoice.cancellation['registrado_fora_da_notem']).toBe(false);
  });
  it('tempo esgotado: operacao_pendente e nunca reenvia', async () => {
    const f = db(); vi.mocked(callTransmissor).mockRejectedValueOnce(new TransmissorError('INDISPONIVEL'));
    await sendFiscalEvent(f.db, event(), invoice());
    const a = finish(f); expect(a._patch['status']).toBe('verifying'); expect(a._invoice.pending_operation).toEqual({ tipo: 'cancelamento', estado: 'em_verificacao', desde: '2026-11-14T18:00:00Z' }); expect(paths()).toEqual(['/v1/nfse/evento']);
  });
  it('recusa do transmissor antes do envio: não enviado', async () => {
    const f = db(); vi.mocked(callTransmissor).mockRejectedValueOnce(new TransmissorError('EVENTO_INVALIDO', 422));
    await sendFiscalEvent(f.db, event(), invoice()); expect(finish(f)._patch['status']).toBe('not_sent');
  });
  it('análise fiscal registrada: cancelamento em análise e webhook próprio', async () => {
    const f = db(); await applyEventReply(f.db, event({ code: '101103' }), invoice(), { resposta: { status: 201, corpo_json: { eventoXml: officialXml('101103') } } });
    const a = finish(f); expect(a['_webhook']).toBe('nota.cancelamento_em_analise'); expect((a['_nota'] as { situacao: string }).situacao).toBe('cancelamento_em_analise'); expect(a._invoice.cancellation['situacao']).toBe('em_analise');
  });
});

describe('Cancelamento: verificação automática', () => {
  it('consulta 200 registra sem chamar o envio', async () => {
    const f = db(); vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 200, corpo_json: { eventoXml: officialXml() } } });
    expect((await processFiscalEventVerifications(f.db)).completed).toBe(1); expect(finish(f)._patch['status']).toBe('registered'); expect(paths()).toEqual(['/v1/nfse/evento/consultar']);
  });
  it('404 antes de 15 minutos continua em verificação', async () => {
    const f = db(); vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 404 } });
    await processFiscalEventVerifications(f.db, Date.parse('2026-11-14T18:14:59Z')); expect(finish(f)._patch['status']).toBe('verifying');
  });
  it('404 por 15 minutos: não registrado, nota segue autorizada', async () => {
    const f = db(); vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 404 } });
    await processFiscalEventVerifications(f.db, Date.parse('2026-11-14T18:15:00Z'));
    const a = finish(f); expect(a._patch['status']).toBe('not_registered'); expect(a._invoice.pending_operation).toBeNull(); expect((a['_nota'] as { situacao: string }).situacao).toBe('autorizada'); expect(a['_webhook']).toBeUndefined();
  });
});

describe('Cancelamento: pedido e respostas da API', () => {
  const ctxBody = { motivo: 'erro_emissao', justificativa: 'Valor “errado” — corrigido na nova emissão…' };
  const args = (f: ReturnType<typeof db>, body: unknown = ctxBody) => ({ db: f.db, organization_id: ids.organization_id, environment: 'sandbox' as const, invoice_id: ids.invoice_id, integration_id: ids.integration_id, origin: 'api' as const, actor: 'actor', kind: 'cancel' as const, body, idempotency_key: 'k', request_hash: 'h' });
  it('justificativa colada é normalizada antes de gravar e enviar', async () => {
    const f = db(); vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 201, corpo_json: { eventoXml: officialXml() } } });
    await requestFiscalEvent(args(f));
    const p = f.calls.find(c => c.name === 'create_fiscal_event_request')?.args['_payload'] as Record<string, string>;
    expect(p['justification']).toBe('Valor "errado" - corrigido na nova emissão...'); expect(p['unsigned_xml']).toContain('<xMotivo>Valor &quot;errado&quot; - corrigido na nova emissão...</xMotivo>');
  });
  it('emoji na justificativa: 422 no campo, sem gravar nem enviar', async () => {
    const f = db(); await expect(requestFiscalEvent(args(f, { motivo: 'outros', justificativa: 'Cliente desistiu do serviço 😕' }))).rejects.toMatchObject({ status: 422, details: [{ campo: 'justificativa', mensagem: FISCAL_TEXT_MESSAGE }] });
    expect(f.calls).toHaveLength(0); expect(callTransmissor).not.toHaveBeenCalled();
  });
  it('justificativa curta: 422', async () => { await expect(requestFiscalEvent(args(db(), { motivo: 'outros', justificativa: 'curta' }))).rejects.toMatchObject({ status: 422 }); });
  it('nota não autorizada: 409', async () => { await expect(requestFiscalEvent(args(db({ invoices: invoice({ status: 'cancelled' }) })))).rejects.toMatchObject({ status: 409, code: 'CONFLITO' }); });
  it('sem certificado ativo: 422 antes de enviar', async () => { await expect(requestFiscalEvent(args(db({ company_certificates: null })))).rejects.toMatchObject({ status: 422, code: 'EMPRESA_NAO_PRONTA' }); });
  it('E0812: certificado de outra base de CNPJ é recusado antes de enviar', async () => { const f = db({ company_certificates: { cnpj: '12345678000195' } }); await expect(requestFiscalEvent(args(f))).rejects.toMatchObject({ status: 422, details: [expect.objectContaining({ campo: 'certificado' })] }); expect(callTransmissor).not.toHaveBeenCalled(); });
  it('mesma chave com outro corpo: 409 IDEMPOTENCIA_CONFLITO', async () => { await expect(requestFiscalEvent(args(db({ invoice_fiscal_events: event({ request_hash: 'outro' }) })))).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCIA_CONFLITO' }); });
  it('mesma chave e corpo: devolve o pedido sem reenviar', async () => { const f = db({ invoice_fiscal_events: event({ status: 'verifying' }) }); const r = await requestFiscalEvent(args(f)); expect(r.event.status).toBe('verifying'); expect(callTransmissor).not.toHaveBeenCalled(); });
  it('respostas: 200, 202, 422 e 503', () => {
    expect(eventResponse({ event: event({ status: 'registered' }), invoice: invoice({ status: 'cancelled' }) }).status).toBe(200);
    expect(eventResponse({ event: event({ status: 'verifying' }), invoice: invoice() }).status).toBe(202);
    expect(() => eventResponse({ event: event({ status: 'rejected' }), invoice: invoice() })).toThrow(expect.objectContaining({ status: 422, code: 'REJEITADO_GOVERNO' }));
    expect(() => eventResponse({ event: event({ status: 'not_sent' }), invoice: invoice() })).toThrow(expect.objectContaining({ status: 503 }));
  });
  it('POST /cancelar exige Idempotency-Key', async () => { const ctx = apiCtx(db().db, {}, `/api/v1/notas/${ids.invoice_id}/cancelar`, { invoiceId: ids.invoice_id }); (ctx as { request: Request }).request = new Request('https://app.notemfiscal.com.br/x', { method: 'POST' }); await expect(cancelInvoice(ctx)).rejects.toMatchObject({ status: 400 }); });
  it('nota expõe operacao_pendente e cancelamento', () => {
    const n = invoiceOut(invoice({ pending_operation: { tipo: 'cancelamento', estado: 'em_verificacao', desde: '2026-11-14T18:00:00Z' }, cancellation: { tipo: 'cancelamento', motivo: 'erro_emissao', justificativa: 'x'.repeat(15), solicitado_em: '2026-11-14T18:00:00Z', registrado_em: null, situacao: 'em_verificacao', pode_solicitar_analise: false } }));
    expect(n.operacao_pendente).toEqual({ tipo: 'cancelamento', estado: 'em_verificacao', desde: '2026-11-14T15:00:00-03:00' }); expect(n.cancelamento).toMatchObject({ situacao: 'em_verificacao', pode_solicitar_analise: false, registrado_fora_da_notem: false });
    expect(invoiceOut(invoice()).operacao_pendente).toBeNull(); expect(invoiceOut(invoice()).cancelamento).toBeNull();
  });
});

describe('Substituição: regras antes de numerar', () => {
  const before = { competence: '2026-11-12', serviceCode: '140101', municipalCode: null, location: '4212254', customerDocument: '11444777000161', serviceValue: '150.00' };
  it('E0060: não optante não muda competência, serviço, código municipal nem local', () => {
    expect(substitutionRuleError(1, before, { ...before, competence: '2026-11-11' })?.campo).toBe('competencia');
    expect(substitutionRuleError(1, before, { ...before, serviceCode: '140102' })?.campo).toBe('servico_id');
    expect(substitutionRuleError(1, before, { ...before, municipalCode: '001' })?.campo).toBe('servico_id');
    expect(substitutionRuleError(1, before, { ...before, location: '4205407' })?.campo).toBe('local_prestacao.codigo_municipio');
    expect(substitutionRuleError(1, before, { ...before, serviceValue: '200.00', customerDocument: '52998224725' })).toBeNull();
  });
  for (const simples of [2, 3]) it(`E0061 (opção ${simples}): não muda documento do tomador, competência nem valor`, () => {
    expect(substitutionRuleError(simples, before, { ...before, customerDocument: '52998224725' })?.campo).toBe('tomador.documento');
    expect(substitutionRuleError(simples, before, { ...before, competence: '2026-11-11' })?.campo).toBe('competencia');
    expect(substitutionRuleError(simples, before, { ...before, serviceValue: '150.01' })?.campo).toBe('valores.servico');
    expect(substitutionRuleError(simples, { ...before, customerDocument: null }, { ...before, customerDocument: '52998224725', serviceCode: '140102' })).toBeNull();
  });
  it('campos não enviados vêm da nota original', () => {
    const b = substitutionBody(invoice(), { motivo: 'outros', justificativa: 'x', descricao: 'Nova descrição' });
    expect(b).toMatchObject({ empresa_id: ids.company_id, servico_id: ids.profile_id, competencia: '2026-11-12', descricao: 'Nova descrição', valores: { servico: '150.00' }, retencao_iss: 'nao_retido', local_prestacao: { codigo_municipio: '4212254' }, tomador: { documento: '11444777000161' } });
    expect(b).not.toHaveProperty('motivo'); expect(b).not.toHaveProperty('justificativa');
  });
  it('original não autorizada: 409; outra empresa: 422', async () => {
    const f = db(); const ctx = apiIssueCtx(apiCtx(f.db, {}));
    await expect(issueSubstitution(ctx, invoice({ status: 'substituted' }), { motivo: 'outros', justificativa: 'Correção da descrição do serviço.' }, 'k', 'h')).rejects.toMatchObject({ status: 409 });
    await expect(issueSubstitution(ctx, invoice(), { motivo: 'outros', justificativa: 'Correção da descrição do serviço.', empresa_id: '10000000-0000-4000-8000-000000000099' }, 'k', 'h')).rejects.toMatchObject({ status: 422, details: [expect.objectContaining({ campo: 'empresa_id' })] });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { callTransmissor } from '../lib/transmissor.server';
import { decodeXml, eventCode, eventsFromReply, readDistributed, readEvent, readNfse, repairText } from '../lib/adn-xml';
import { BACKOFF_MS, classifyDfe, cursorPatch, flushNfseEventWebhooks, NO_DOCUMENTS_WAIT_MS, processAdnSync, reconcileRefusedCancellations } from '../lib/adn-sync.server';
import { tableDb, ids } from './fake-db';
vi.mock('../lib/transmissor.server', () => ({ callTransmissor: vi.fn(), TransmissorError: class extends Error { constructor(public code: string, public status?: number) { super(code); } } }));

const key = '42122542263642453000131000000000001126118598361723';
const other = '42122542211222333000181000000000000126111234567890';
const eventXml = (code = '101101', k = key, seq = '1', reason = 'SERVIÃ‡O NÃƒO REALIZADO') => `<?xml version="1.0" encoding="utf-8"?><evento versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infEvento Id="EVT${k}${code}00${seq}"><nSeqEvento>${seq}</nSeqEvento><dhProc>2026-11-14T18:08:20-03:00</dhProc><pedRegEvento versao="1.01"><infPedReg Id="PRE${k}${code}"><tpAmb>1</tpAmb><dhEvento>2026-11-14T18:08:20-03:00</dhEvento><CNPJAutor>63642453000131</CNPJAutor><chNFSe>${k}</chNFSe><e${code}><xDesc>Evento</xDesc><cMotivo>1</cMotivo><xMotivo>${reason}</xMotivo>${code === '105102' ? `<chSubstituta>${other}</chSubstituta>` : ''}</e${code}></infPedReg></pedRegEvento></infEvento></evento>`;
const nfseXml = (k = key, prest = '63642453000131', toma = '11444777000161') => `<NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${k}"><xLocEmi>Passo de Torres</xLocEmi><nNFSe>12</nNFSe><cStat>100</cStat><dhProc>2026-11-10T10:00:00-03:00</dhProc><emit><CNPJ>${prest}</CNPJ><xNome>Group Jota</xNome></emit><valores><vBC>100.00</vBC><vLiq>100.00</vLiq></valores><DPS versao="1.01"><infDPS Id="DPS421225426364245300013100900000000000000012"><dhEmi>2026-11-10T09:59:00-03:00</dhEmi><serie>900</serie><nDPS>12</nDPS><dCompet>2026-11-10</dCompet><prest><CNPJ>${prest}</CNPJ></prest><toma><CNPJ>${toma}</CNPJ><xNome>Tomador &amp; Cia</xNome></toma><serv><cServ><cTribNac>140101</cTribNac><xDescServ>Vistoria</xDescServ></cServ></serv><valores><vServPrest><vServ>100.00</vServ></vServPrest><trib><tribMun><tpRetISSQN>1</tpRetISSQN></tribMun></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
/** Sefin format: base64 of the base64-gzip text. */
const sefinEncode = (xml: string) => Buffer.from(gzipSync(Buffer.from(xml)).toString('base64')).toString('base64');
const adnEncode = (xml: string) => gzipSync(Buffer.from(xml)).toString('base64');
beforeEach(() => vi.mocked(callTransmissor).mockReset());

describe('Leitura dos documentos do governo', () => {
  it('decodifica XML puro, base64-gzip e base64 de base64-gzip (formato da Sefin)', async () => {
    const xml = eventXml();
    expect(await decodeXml(xml)).toBe(xml);
    expect(await decodeXml(adnEncode(xml))).toBe(xml);
    expect(await decodeXml(sefinEncode(xml))).toBe(xml);
    expect(await decodeXml('não é base64')).toBeNull();
  });
  it('corrige texto com codificação dupla do governo sem alterar texto correto', () => {
    expect(repairText('SERVIÃ‡O NÃƒO REALIZADO')).toBe('SERVIÇO NÃO REALIZADO');
    expect(repairText('Serviço não realizado')).toBe('Serviço não realizado');
  });
  it('lê o evento oficial: chave, código, sequência, motivo e substituta', () => {
    const e = readEvent(eventXml('105102'))!;
    expect(e).toMatchObject({ access_key: key, code: '105102', sequence: 1, reason_code: '1', reason_text: 'SERVIÇO NÃO REALIZADO', substitute_key: other, author_document: '63642453000131', processed_at: '2026-11-14T21:08:20.000Z' });
  });
  it('recusa XML com DTD/entidades', () => {
    expect(readEvent(`<!DOCTYPE x [<!ENTITY a "b">]>${eventXml()}`)).toBeNull();
    expect(readNfse(`<!DOCTYPE x>${nfseXml()}`)).toBeNull();
  });
  it('lê a NFS-e: prestador, tomador, DPS e valores', () => {
    const n = readNfse(nfseXml())!;
    expect(n).toMatchObject({ access_key: key, nfse_number: '12', dps_series: '900', dps_number: '12', provider_cnpj: '63642453000131', taker_document: '11444777000161', taker_name: 'Tomador & Cia', competence: '2026-11-10' });
    expect(n.summary['valores']).toMatchObject({ valor_servico: '100.00', valor_liquido: '100.00', iss_retido: false });
  });
  it('mapeia os tipos do ADN para os códigos oficiais', () => {
    expect(eventCode('CANCELAMENTO')).toBe('101101'); expect(eventCode('DESBLOQUEIO_POR_OFICIO')).toBe('305103'); expect(eventCode('CANCELAMENTO_INDEFERIDO_ANALISE_FISCAL')).toBe('105105');
    expect(eventCode(101101)).toBe('101101'); expect(eventCode('TRIBUTOS_NFSE_RECOLHIDOS')).toBe('TRIBUTOS_NFSE_RECOLHIDOS');
  });
  it('item do lote: NFS-e e evento; eventos sem layout usam os dados da distribuição', async () => {
    const n = await readDistributed({ NSU: 7, TipoDocumento: 'NFSE', ChaveAcesso: key, Xml: nfseXml() });
    expect(n.nsu).toBe(7); expect(n.nfse?.access_key).toBe(key);
    const e = await readDistributed({ NSU: 8, TipoDocumento: 'EVENTO', TipoEvento: 'CANCELAMENTO', ChaveAcesso: key, ArquivoXml: adnEncode(eventXml()) });
    expect(e.event?.code).toBe('101101');
    const t = await readDistributed({ NSU: 9, TipoDocumento: 'EVENTO', TipoEvento: 'TRIBUTOS_NFSE_RECOLHIDOS', ChaveAcesso: key, DataHoraGeracao: '2026-11-14T10:00:00', Xml: '<registro/>' });
    expect(t.event).toMatchObject({ code: 'TRIBUTOS_NFSE_RECOLHIDOS', access_key: key, sequence: 1 });
  });
  it('resposta real da Sefin (eventos[].arquivoXml) é reconhecida', async () => {
    const events = await eventsFromReply({ eventos: [{ arquivoXml: sefinEncode(eventXml()), chaveAcesso: key, tipoEvento: 101101, numeroPedidoRegistroEvento: 1 }] });
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ code: '101101', sequence: 1, reason_text: 'SERVIÇO NÃO REALIZADO' });
  });
});

describe('Cursor por NSU', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  it('DOCUMENTOS_LOCALIZADOS continua sem espera', () => {
    const o = classifyDfe({ status: 200, corpo_json: { StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: [{ NSU: 1 }] } });
    expect(o.kind).toBe('documents'); expect(cursorPatch(o, 2, now, 2)).toMatchObject({ status: 'syncing', next_nsu: 2, failures: 0, next_query_at: new Date(now).toISOString() });
  });
  it('NENHUM_DOCUMENTO_LOCALIZADO: próxima consulta só após 1 hora', () => {
    const o = classifyDfe({ status: 404, corpo_json: { StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO' } });
    expect(o.kind).toBe('none'); expect(cursorPatch(o, 0, now).next_query_at).toBe(new Date(now + 60 * 60_000).toISOString()); expect(NO_DOCUMENTS_WAIT_MS).toBe(3_600_000);
  });
  it('erro: espera crescente 5 min, 15 min, 1 h, 3 h e 6 h no máximo', () => {
    const o = classifyDfe({ erro: 'CONEXAO' });
    const waits = [0, 1, 2, 3, 4, 5, 9].map(f => Date.parse(cursorPatch(o, f, now).next_query_at) - now);
    expect(waits).toEqual([5, 15, 60, 180, 360, 360, 360].map(m => m * 60_000)); expect(BACKOFF_MS[0]).toBe(300_000);
  });
  it('REJEICAO registra código e mensagem', () => {
    const o = classifyDfe({ status: 400, corpo_json: { StatusProcessamento: 'REJEICAO', Erros: [{ Codigo: 'E2220', Descricao: 'NSU inválido' }] } });
    expect(o).toMatchObject({ kind: 'error', code: 'E2220' }); expect(cursorPatch(o, 0, now)).toMatchObject({ status: 'error', failures: 1, last_error_code: 'E2220' });
  });
  it('consumo indevido: nunca menos de 1 hora, ou a espera indicada se maior', () => {
    const a = classifyDfe({ status: 400, corpo_json: { StatusProcessamento: 'REJEICAO', Erros: [{ Codigo: 'E2232', Descricao: 'Consumo indevido. Aguarde 5 minutos.' }] } });
    expect(Date.parse(cursorPatch(a, 0, now).next_query_at) - now).toBe(3_600_000);
    const b = classifyDfe({ status: 400, corpo_json: { StatusProcessamento: 'REJEICAO', Erros: [{ Descricao: 'Consumo indevido: aguarde 2 horas' }] } });
    expect(Date.parse(cursorPatch(b, 0, now).next_query_at) - now).toBe(7_200_000);
  });
});

const cursor = { cnpj: '63642453000131', environment: 'production', next_nsu: 0, failures: 0, claim_token: '50000000-0000-4000-8000-000000000001', company_id: ids.company_id, organization_id: ids.organization_id, actor: ids.profile_id };
function syncDb() {
  return tableDb({ company_certificate_material: { key_version: '1', nonce: 'n', data: 'd' } }, name => {
    if (name === 'claim_adn_cursors') return { data: [cursor], error: null };
    if (name === 'finish_adn_batch') return { data: { inserted: 2 }, error: null };
    return { data: null, error: null };
  });
}
const batches = (f: ReturnType<typeof syncDb>) => f.calls.filter(c => c.name === 'finish_adn_batch').map(c => c.args as { _items: Record<string, unknown>[]; _patch: Record<string, unknown> });

describe('Sincronização (rotina de cada minuto)', () => {
  it('processa lotes, avança para o maior NSU + 1 e para quando não há documentos', async () => {
    const f = syncDb();
    vi.mocked(callTransmissor)
      .mockResolvedValueOnce({ resposta: { status: 200, corpo_json: { StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: [{ NSU: 0, TipoDocumento: 'NFSE', ChaveAcesso: key, Xml: nfseXml() }, { NSU: 4, TipoDocumento: 'EVENTO', TipoEvento: 'CANCELAMENTO', ChaveAcesso: key, Xml: eventXml() }] } } })
      .mockResolvedValueOnce({ resposta: { status: 404, corpo_json: { StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO' } } });
    const r = await processAdnSync(f.db, { now: () => 1_000 });
    expect(r).toMatchObject({ reserved: 1, failed: 0 });
    const calls = vi.mocked(callTransmissor).mock.calls;
    expect(calls.map(c => [c[0], (c[1] as { nsu: number }).nsu, (c[1] as { cnpj_consulta: string }).cnpj_consulta])).toEqual([['/v1/adn/dfe', 0, '63642453000131'], ['/v1/adn/dfe', 5, '63642453000131']]);
    const [first, second] = batches(f);
    expect(first!._patch).toMatchObject({ status: 'syncing', next_nsu: 5, continue: true });
    expect(first!._items.map(i => [i['nsu'], 'nfse' in i, 'event' in i])).toEqual([[0, true, false], [4, false, true]]);
    expect(second!._patch).toMatchObject({ status: 'up_to_date', next_query_at: new Date(1_000 + 3_600_000).toISOString() });
    expect(f.inserts.filter(i => i.table === 'certificate_audit_events')).toHaveLength(1);
  });
  it('falha do transmissor (rota ausente): registra erro e espera 5 minutos, sem repetir no mesmo ciclo', async () => {
    const f = syncDb(); const { TransmissorError } = await import('../lib/transmissor.server');
    vi.mocked(callTransmissor).mockRejectedValueOnce(new TransmissorError('INDISPONIVEL', 404));
    const r = await processAdnSync(f.db, { now: () => 0 });
    expect(r.failed).toBe(1); expect(vi.mocked(callTransmissor)).toHaveBeenCalledTimes(1);
    expect(batches(f)[0]!._patch).toMatchObject({ status: 'error', failures: 1, last_error_code: 'INDISPONIVEL_404', next_query_at: new Date(300_000).toISOString() });
  });
  it('respeita o limite de lotes por ciclo (devolve a reserva ao fim)', async () => {
    const f = syncDb();
    vi.mocked(callTransmissor).mockResolvedValue({ resposta: { status: 200, corpo_json: { StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: [{ NSU: 10, TipoDocumento: 'NFSE', Xml: nfseXml() }] } } });
    await processAdnSync(f.db, { maxBatches: 2, now: () => 0 });
    expect(vi.mocked(callTransmissor)).toHaveBeenCalledTimes(2); const b = batches(f);
    expect(b.map(x => x._patch['continue'])).toEqual([true, false]);
  });
});

describe('Reconciliação de cancelamento recusado por evento existente', () => {
  const refused = { id: ids.invoice_id, organization_id: ids.organization_id, company_id: ids.company_id, created_by: ids.profile_id, environment: 'production', status: 'authorized', access_key: key, cancellation: { situacao: 'recusado', erros_governo: [{ codigo_governo: 'E0840' }] } };
  it('ADN indisponível: confirma pela Sefin (sequência "1") e aplica o cancelamento como registrado fora da notem', async () => {
    const f = tableDb({ invoices: refused, company_certificate_material: { key_version: '1', nonce: 'n', data: 'd' } }, name => name === 'store_nfse_events' ? { data: { total: 1, changed: 1 }, error: null } : { data: null, error: null });
    (f.db as unknown as { from: ReturnType<typeof vi.fn> }).from.mockImplementation((t: string) => { const b: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'not', 'limit', 'is', 'order']) b[m] = () => b; b['then'] = (res: (v: unknown) => void) => res({ data: t === 'invoices' ? [refused] : null, error: null }); b['maybeSingle'] = async () => ({ data: t === 'company_certificate_material' ? { key_version: '1', nonce: 'n', data: 'd' } : null, error: null }); b['insert'] = async () => ({ error: null }); return b; });
    vi.mocked(callTransmissor).mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce({ resposta: { status: 200, corpo_json: { eventos: [{ arquivoXml: sefinEncode(eventXml()), chaveAcesso: key, tipoEvento: 101101 }] } } });
    const r = await reconcileRefusedCancellations(f.db);
    expect(r).toEqual({ checked: 1, changed: 1 });
    expect(vi.mocked(callTransmissor).mock.calls.map(c => c[0])).toEqual(['/v1/adn/eventos', '/v1/nfse/evento/consultar']);
    expect(vi.mocked(callTransmissor).mock.calls[1]![1]).toMatchObject({ chave_acesso: key, tipo_evento: '101101', num_seq_evento: '1' });
    const store = f.calls.find(c => c.name === 'store_nfse_events')!.args as { _source: string; _items: { code: string }[] };
    expect(store._source).toBe('sefin_consulta'); expect(store._items.map(i => i.code)).toEqual(['101101']);
    expect(f.calls.find(c => c.name === 'touch_nfse_refresh')!.args).toMatchObject({ _interval: '1 hour' });
  });
});

describe('Avisos dos eventos aplicados', () => {
  it('emite uma vez por evento com o objeto nota atual', async () => {
    const f = tableDb({}, name => name === 'emit_nfse_event_webhook' ? { data: 1, error: null } : { data: null, error: null });
    (f.db as unknown as { from: ReturnType<typeof vi.fn> }).from.mockImplementation((t: string) => { const b: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'not', 'limit', 'is', 'order']) b[m] = () => b; b['then'] = (res: (v: unknown) => void) => res({ data: [{ id: 'ev1', invoice_id: ids.invoice_id }], error: null }); b['maybeSingle'] = async () => ({ data: t === 'invoices' ? { id: ids.invoice_id, organization_id: ids.organization_id, company_id: ids.company_id, environment: 'production', status: 'cancelled', dps_series: 900, dps_number: 1, sent_values: {}, service_snapshot: {}, restrictions: [], government_errors: [], created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z', emitted_at: '2026-11-14T00:00:00Z' } : null, error: null }); return b; });
    expect(await flushNfseEventWebhooks(f.db)).toEqual({ emitted: 1 });
    const call = f.calls.find(c => c.name === 'emit_nfse_event_webhook')!.args as { _event: string; _nota: { situacao: string } };
    expect(call._event).toBe('ev1'); expect(call._nota.situacao).toBe('cancelada');
  });
});

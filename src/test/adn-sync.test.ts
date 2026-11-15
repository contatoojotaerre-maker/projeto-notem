import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { callTransmissor } from '../lib/transmissor.server';
import { decodeXml, eventCode, eventsFromReply, readDistributed, readEvent, readNfse, repairText } from '../lib/adn-xml';
import { applySearchStep, BACKOFF_MS, classifyDfe, cursorPatch, flushNfseEventWebhooks, MAX_SEARCH_STEPS, NO_DOCUMENTS_WAIT_MS, processAdnSync, reconcileRefusedCancellations, runDailyEventCheck, searchProbe, SYNC_MONTHS, syncOptions, type SyncRequest } from '../lib/adn-sync.server';
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
  it('transmissor v4: usa eventos[].xml já decodificado, mesmo com arquivoXml presente', async () => {
    const events = await eventsFromReply({ eventos: [{ arquivoXml: 'corrompido', xml: eventXml(), chaveAcesso: key, tipoEvento: 101101 }] });
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ access_key: key, code: '101101', sequence: 1, reason_code: '1' });
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
const docs = (...items: Record<string, unknown>[]) => ({ resposta: { status: 200, corpo_json: { StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: items } } });
const none = { resposta: { status: 404, corpo_json: { StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO' } } };
function syncDb(request: Record<string, unknown> | null, missing = (n: number) => n) {
  return tableDb({ company_certificate_material: { key_version: '1', nonce: 'n', data: 'd' } }, (name, args) => {
    if (name === 'claim_adn_cursors') return { data: request ? [{ ...cursor, request }] : [], error: null };
    if (name === 'finish_adn_batch') return { data: { inserted: (args['_items'] as unknown[]).length }, error: null };
    if (name === 'adn_next_missing_nsu') return { data: missing(Number(args['_from'])), error: null };
    return { data: null, error: null };
  });
}
const batches = (f: ReturnType<typeof syncDb>) => f.calls.filter(c => c.name === 'finish_adn_batch').map(c => c.args as { _items: Record<string, unknown>[]; _patch: Record<string, unknown> });
const base = { steps: 0, imported: 0, requested_at: '2026-11-15T12:00:00Z' };
const clock = (start = Date.parse('2026-11-15T12:00:00Z')) => { let t = start; return { now: () => t, wait: async (ms: number) => { t += ms; }, tick: (ms: number) => { t += ms; } }; };

describe('Sincronização manual: opções e permissões', () => {
  it('"Novidades" só aparece depois da primeira sincronização concluída; períodos 1, 3, 6, 12 e 24 meses (padrão 1 mês)', () => {
    expect(syncOptions(null)).toEqual(['period:1', 'period:3', 'period:6', 'period:12', 'period:24']);
    expect(syncOptions('2026-11-14T20:08:00Z')).toEqual(['news', 'period:1', 'period:3', 'period:6', 'period:12', 'period:24']);
    expect(SYNC_MONTHS).toEqual([1, 3, 6, 12, 24]);
  });
  it('a rotina de cada minuto não consulta nada sem pedido feito no painel', async () => {
    const f = syncDb(null); const r = await processAdnSync(f.db);
    expect(r).toEqual({ reserved: 0, imported: 0, failed: 0 }); expect(vi.mocked(callTransmissor)).not.toHaveBeenCalled();
  });
});

describe('Busca do NSU inicial do período (DataHoraGeracao)', () => {
  const target = '2026-10-15T00:00:00.000Z'; const at = (d: string) => `${d}T10:00:00.000Z`;
  it('passo a passo em lotes até achar o primeiro NSU do período', () => {
    let r = { ...base, mode: 'period', months: 1, phase: 'search', lo: 0, hi: null, target } as SyncRequest;
    expect(searchProbe(r)).toBe(0);
    let s = applySearchStep(r, 0, [{ nsu: 1, generated_at: at('2026-03-01') }, { nsu: 2, generated_at: at('2026-04-01') }]);
    expect(s.start).toBeNull(); expect(s.request).toMatchObject({ lo: 3, jump: 50 }); r = s.request; expect(searchProbe(r)).toBe(53);
    s = applySearchStep(r, 53, []); expect(s.request).toMatchObject({ lo: 3, hi: 53 }); r = s.request; expect(searchProbe(r)).toBe(3);
    s = applySearchStep(r, 3, [{ nsu: 3, generated_at: at('2026-09-01') }, { nsu: 4, generated_at: at('2026-10-20') }, { nsu: 5, generated_at: at('2026-11-01') }]);
    expect(s.start).toBe(4); expect(s.request).toMatchObject({ phase: 'download', start_nsu: 4, position: 4, steps: 3 });
  });
  it('no máximo 25 etapas: depois disso começa pelo menor NSU ainda possível (nada do período fica de fora)', () => {
    let r = { ...base, mode: 'period', months: 24, phase: 'search', lo: 0, hi: 10_000_000, target } as SyncRequest; let s;
    for (let k = 0; k < 30; k++) { const p = searchProbe(r); s = applySearchStep(r, p, [{ nsu: p, generated_at: at('2025-01-01') }]); r = s.request; if (s.start !== null) break; }
    expect(MAX_SEARCH_STEPS).toBe(25); expect(r.steps).toBeLessThanOrEqual(25); expect(s!.start).toBe(r.lo);
  });
  it('busca: 2 segundos entre consultas, etapas sem documentos não acionam a espera de 1 hora', async () => {
    const c = clock(); const f = syncDb({ ...base, mode: 'period', months: 1, phase: 'search', lo: 0, hi: null, target });
    vi.mocked(callTransmissor).mockResolvedValueOnce(docs({ NSU: 1, DataHoraGeracao: '2026-03-01T10:00:00' }, { NSU: 2, DataHoraGeracao: '2026-04-01T10:00:00' })).mockResolvedValueOnce(none).mockResolvedValueOnce(docs({ NSU: 3, DataHoraGeracao: '2026-11-01T10:00:00' })).mockResolvedValue(none);
    const waits: number[] = []; let t = c.now();
    await processAdnSync(f.db, { now: c.now, wait: async ms => { waits.push(ms); t += ms; await c.wait(ms); }, budgetMs: 60_000 });
    expect(waits.length).toBeGreaterThan(0); expect(waits.every(w => w >= 2_000)).toBe(true); expect(t).toBeGreaterThan(0);
    const b = batches(f); const searchSteps = b.filter(x => (x._patch['request'] as SyncRequest | null)?.phase === 'search' || (x._patch['request'] as SyncRequest | null)?.start_nsu !== undefined);
    for (const x of searchSteps.slice(0, 2)) expect(Date.parse(String(x._patch['next_query_at'])) - c.now()).toBeLessThan(3_600_000);
    const nsus = vi.mocked(callTransmissor).mock.calls.map(x => (x[1] as { nsu: number }).nsu);
    expect(nsus.slice(0, 3)).toEqual([0, 53, 3]);
  });
  it('consumo indevido interrompe a busca na hora, com aviso claro e espera mínima de 1 hora', async () => {
    const c = clock(); const f = syncDb({ ...base, mode: 'period', months: 3, phase: 'search', lo: 0, hi: null, target });
    vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 400, corpo_json: { StatusProcessamento: 'REJEICAO', Erros: [{ Codigo: 'E2232', Descricao: 'Consumo indevido' }] } } });
    const r = await processAdnSync(f.db, { now: c.now, wait: c.wait });
    expect(r.failed).toBe(1); expect(vi.mocked(callTransmissor)).toHaveBeenCalledTimes(1);
    const p = batches(f)[0]!._patch;
    expect(p).toMatchObject({ status: 'error', request: null, last_error_code: 'CONSUMO_INDEVIDO' }); expect(String(p['last_error'])).toMatch(/consumo indevido.*interrompida/i);
    expect(Date.parse(String(p['next_query_at'])) - c.now()).toBeGreaterThanOrEqual(3_600_000);
    expect((p['last_request'] as { outcome: string }).outcome).toBe('error');
  });
  it('rejeição do ADN também interrompe a busca e encerra o pedido', async () => {
    const c = clock(); const f = syncDb({ ...base, mode: 'period', months: 6, phase: 'search', lo: 0, hi: null, target });
    vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 400, corpo_json: { StatusProcessamento: 'REJEICAO', Erros: [{ Codigo: 'E2220', Descricao: 'NSU inválido' }] } } });
    await processAdnSync(f.db, { now: c.now, wait: c.wait });
    expect(batches(f)[0]!._patch).toMatchObject({ status: 'error', request: null, last_error_code: 'E2220' }); expect(String(batches(f)[0]!._patch['last_error'])).toMatch(/busca do início do período foi interrompida/);
  });
});

describe('Importação depois do NSU inicial', () => {
  it('importa em lotes, pula o que já foi importado, guarda XML em arquivo e termina com espera de 1 hora', async () => {
    const c = clock(); const f = syncDb({ ...base, mode: 'news', months: null, phase: 'download', position: 0 }, n => n === 0 ? 0 : 20);
    vi.mocked(callTransmissor).mockResolvedValueOnce(docs({ NSU: 0, TipoDocumento: 'NFSE', ChaveAcesso: key, Xml: nfseXml() }, { NSU: 4, TipoDocumento: 'EVENTO', TipoEvento: 'CANCELAMENTO', ChaveAcesso: key, Xml: eventXml() })).mockResolvedValueOnce(none);
    await processAdnSync(f.db, { now: c.now, wait: c.wait });
    expect(vi.mocked(callTransmissor).mock.calls.map(x => (x[1] as { nsu: number }).nsu)).toEqual([0, 20]);
    const [first, last] = batches(f);
    expect(first!._items.map(i => [i['nsu'], 'nfse' in i, 'event' in i])).toEqual([[0, true, false], [4, false, true]]);
    const nfse = first!._items[0]!['nfse'] as Record<string, unknown>; expect(nfse['xml']).toBeUndefined(); expect(nfse['xml_file']).toMatchObject({ size: nfseXml().length, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(String((nfse['xml_file'] as { path: string }).path)).toMatch(/^producao\/adn\/nfse\/\d{50}-[0-9a-f]{16}\.xml\.gz$/);
    expect(first!._patch).toMatchObject({ status: 'syncing', next_nsu: 5, continue: true });
    expect(last!._patch).toMatchObject({ status: 'up_to_date', request: null, completed: true, next_query_at: new Date(c.now() + 3_600_000).toISOString() });
    expect(f.files.size).toBe(2);
  });
  it('erro de conexão durante a importação encerra o pedido com espera crescente', async () => {
    const c = clock(); const f = syncDb({ ...base, mode: 'news', months: null, phase: 'download', position: 14 }); const { TransmissorError } = await import('../lib/transmissor.server');
    vi.mocked(callTransmissor).mockRejectedValueOnce(new TransmissorError('INDISPONIVEL', 503));
    await processAdnSync(f.db, { now: c.now, wait: c.wait });
    expect(batches(f)[0]!._patch).toMatchObject({ status: 'error', request: null, failures: 1, next_query_at: new Date(c.now() + 300_000).toISOString() });
  });
});

describe('XML compactado no armazenamento privado', () => {
  it('compacta, confere byte a byte e lê de volta idêntico; impressão digital divergente é recusada', async () => {
    const f = tableDb({}); const xml = eventXml(); const { storeXml, readXml, xmlPath, sha256Hex } = await import('../lib/xml-files.server');
    const sha = await sha256Hex(new TextEncoder().encode(xml)); const ref = await storeXml(f.db, xmlPath('production', 'adn/eventos/' + key, '101101-1', sha), xml);
    expect(ref.sha256).toBe(sha); expect(ref.size).toBe(new TextEncoder().encode(xml).length); expect(ref.stored_size).toBeLessThan(ref.size);
    expect(await readXml(f.db, ref)).toBe(xml);
    await expect(readXml(f.db, { ...ref, sha256: '0'.repeat(64) })).rejects.toThrow('XML_HASH_MISMATCH');
  });
});

describe('Verificação diária das notas com cancelamento pendente', () => {
  const pending = { id: ids.invoice_id, organization_id: ids.organization_id, company_id: ids.company_id, created_by: ids.profile_id, environment: 'production', status: 'cancellation_pending', access_key: key };
  const dailyDb = (beat: string | null) => tableDb({ system_heartbeats: beat ? { last_success_at: beat } : null, company_certificate_material: { key_version: '1', nonce: 'n', data: 'd' } }, name => name === 'daily_check_candidates' ? { data: [pending], error: null } : name === 'store_nfse_events' ? { data: { total: 1, changed: 1 }, error: null } : { data: null, error: null });
  it('uma vez por dia (a partir das 6h de Brasília): consulta os eventos e registra verificadas e atualizadas', async () => {
    const f = dailyDb(null); vi.mocked(callTransmissor).mockResolvedValueOnce({ resposta: { status: 200, corpo_json: { LoteDFe: [{ TipoDocumento: 'EVENTO', TipoEvento: 'CANCELAMENTO_DEFERIDO_ANALISE_FISCAL', ChaveAcesso: key, Xml: eventXml('105104') }] } } });
    const r = await runDailyEventCheck(f.db, Date.parse('2026-11-15T12:00:00Z'));
    expect(r).toEqual({ ran: true, checked: 1, updated: 1 }); expect(vi.mocked(callTransmissor).mock.calls[0]![0]).toBe('/v1/adn/eventos');
    expect(f.calls.find(c => c.name === 'record_daily_check')!.args).toMatchObject({ _date: '2026-11-15', _company: ids.company_id, _updated: true, _failed: false });
    expect(f.calls.find(c => c.name === 'touch_nfse_refresh')!.args).toMatchObject({ _purpose: 'verificacao_diaria', _interval: '20 hours' });
  });
  it('não repete no mesmo dia e não roda antes das 6h de Brasília', async () => {
    expect((await runDailyEventCheck(dailyDb('2026-11-15T10:00:00Z').db, Date.parse('2026-11-15T20:00:00Z'))).ran).toBe(false);
    expect((await runDailyEventCheck(dailyDb(null).db, Date.parse('2026-11-15T08:00:00Z'))).ran).toBe(false);
    expect(vi.mocked(callTransmissor)).not.toHaveBeenCalled();
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

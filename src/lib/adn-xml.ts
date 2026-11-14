// Safe readers for documents distributed by the ADN/Sefin: decoding (base64/gzip), official NFS-e and event XML.
import { XMLParser, XMLValidator } from 'fast-xml-parser';

/** ADN event names → official event codes (evento_v1.01). Names without an XSD type keep their ADN name. */
export const adnEventCodes: Record<string, string> = {
  CANCELAMENTO: '101101', SOLICITACAO_CANCELAMENTO_ANALISE_FISCAL: '101103', CANCELAMENTO_POR_SUBSTITUICAO: '105102',
  CANCELAMENTO_DEFERIDO_ANALISE_FISCAL: '105104', CANCELAMENTO_INDEFERIDO_ANALISE_FISCAL: '105105',
  CONFIRMACAO_PRESTADOR: '202201', CONFIRMACAO_TOMADOR: '203202', CONFIRMACAO_INTERMEDIARIO: '204203', CONFIRMACAO_TACITA: '205204',
  REJEICAO_PRESTADOR: '202205', REJEICAO_TOMADOR: '203206', REJEICAO_INTERMEDIARIO: '204207', ANULACAO_REJEICAO: '205208',
  CANCELAMENTO_POR_OFICIO: '305101', BLOQUEIO_POR_OFICIO: '305102', DESBLOQUEIO_POR_OFICIO: '305103',
  INCLUSAO_NFSE_DAN: 'INCLUSAO_NFSE_DAN', TRIBUTOS_NFSE_RECOLHIDOS: 'TRIBUTOS_NFSE_RECOLHIDOS',
};
export function eventCode(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (/^\d{6}$/.test(v)) return v;
  return adnEventCodes[v.toUpperCase()] ?? (/^[A-Z_]{3,60}$/.test(v) ? v : null);
}

const cp1252: Record<string, number> = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
/** Repairs text the government stored double-encoded (e.g. "SERVIÃ‡O" → "SERVIÇO"); the original XML is never changed. */
export function repairText(value: string | null): string | null {
  if (!value || !/[ÃÂ][\u0080-\u00BF\u2010-\u203A\u0152-\u0178\u02C6\u02DC\u20AC\u2122\u0192]/.test(value)) return value;
  const bytes: number[] = [];
  for (const ch of value) { const c = ch.codePointAt(0)!; if (c < 0x100) bytes.push(c); else if (cp1252[ch] !== undefined) bytes.push(cp1252[ch]!); else return value; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch { return value; }
}

const b64bytes = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, '')), c => c.charCodeAt(0));
async function gunzip(bytes: Uint8Array) {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/** Accepts plain XML, base64 XML, base64 gzip, or base64 of a base64-gzip string (as Sefin returns in arquivoXml). */
export async function decodeXml(value: unknown, depth = 0): Promise<string | null> {
  if (typeof value !== 'string' || !value.trim() || value.length > 20_000_000) return null;
  const v = value.trim().replace(/^\uFEFF/, '');
  if (v.startsWith('<')) return v;
  if (depth > 2 || !/^[A-Za-z0-9+/=\s]+$/.test(v)) return null;
  try {
    let bytes = b64bytes(v);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
    return decodeXml(new TextDecoder('utf-8').decode(bytes), depth + 1);
  } catch { return null; }
}

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, processEntities: false, trimValues: true });
function parseSafe(xml: string) {
  if (xml.length > 5_000_000 || /<!\s*(DOCTYPE|ENTITY)/i.test(xml) || XMLValidator.validate(xml) !== true) return null;
  try { return parser.parse(xml) as Record<string, unknown>; } catch { return null; }
}
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const str = (v: unknown) => { if (v === undefined || v === null) return null; const s = typeof v === 'object' ? String(obj(v)['#text'] ?? '') : String(v); return s.trim() ? s.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") : null; };
const iso = (v: unknown) => { const s = str(v); return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null; };
const date = (v: unknown) => { const s = str(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const doc = (o: Obj) => str(o['CNPJ']) ?? str(o['CPF']);

export type ParsedNfse = { access_key: string; nfse_number: string | null; dps_id: string | null; dps_series: string | null; dps_number: string | null; competence: string | null; issued_at: string | null; authorized_at: string | null; provider_cnpj: string | null; provider_name: string | null; taker_document: string | null; taker_name: string | null; intermediary_document: string | null; intermediary_name: string | null; substitutes_key: string | null; summary: Obj; xml: string };
/** Reads an official NFS-e (any issuer). Returns null when it is not a well-formed NFS-e. */
export function readNfse(xml: string): ParsedNfse | null {
  if (!xml.includes('http://www.sped.fazenda.gov.br/nfse')) return null;
  const root = parseSafe(xml); const info = obj(obj(root?.['NFSe'])['infNFSe']);
  const id = str(info['@_Id']); if (!id || !/^NFS\d{50}$/.test(id)) return null;
  const dps = obj(obj(info['DPS'])['infDPS']); const prest = obj(dps['prest']); const toma = obj(dps['toma']); const interm = obj(dps['interm']);
  const emit = obj(info['emit']); const serv = obj(dps['serv']); const cServ = obj(serv['cServ']); const val = obj(info['valores']); const dv = obj(dps['valores']);
  const trib = obj(obj(dv['trib'])['tribMun']);
  return {
    access_key: id.slice(3), nfse_number: str(info['nNFSe']), dps_id: str(dps['@_Id']), dps_series: str(dps['serie']), dps_number: str(dps['nDPS']),
    competence: date(dps['dCompet']), issued_at: iso(dps['dhEmi']), authorized_at: iso(info['dhProc']),
    provider_cnpj: doc(prest) ?? doc(emit), provider_name: repairText(str(emit['xNome']) ?? str(prest['xNome'])),
    taker_document: doc(toma), taker_name: repairText(str(toma['xNome'])), intermediary_document: doc(interm), intermediary_name: repairText(str(interm['xNome'])),
    substitutes_key: str(obj(dps['subst'])['chSubstda']),
    summary: {
      situacao_codigo: str(info['cStat']), local_emissao: repairText(str(info['xLocEmi'])), local_prestacao: repairText(str(info['xLocPrestacao'])), municipio_incidencia: repairText(str(info['xLocIncid'])),
      tomador: { documento: doc(toma), nif: str(toma['NIF']), nome: repairText(str(toma['xNome'])), email: str(toma['email']) },
      servico: { codigo_servico: str(cServ['cTribNac']), codigo_municipal: str(cServ['cTribMun']), descricao: repairText(str(cServ['xDescServ'])), local_prestacao: str(obj(serv['locPrest'])['cLocPrestacao']) },
      valores: { valor_servico: str(obj(dv['vServPrest'])['vServ']), base_calculo: str(val['vBC']), aliquota_iss: str(val['pAliqAplic']), valor_iss: str(val['vISSQN']), valor_liquido: str(val['vLiq']), iss_retido: ['2', '3'].includes(str(trib['tpRetISSQN']) ?? '1') },
    },
    xml,
  };
}

export type ParsedEvent = { access_key: string; code: string; sequence: number; adn_type: string | null; processed_at: string | null; event_at: string | null; author_document: string | null; reason_code: string | null; reason_text: string | null; substitute_key: string | null; xml: string };
/** Reads an official event (evento v1.01). Metadata from the distribution fills gaps for types without an XSD layout. */
export function readEvent(xml: string, meta: { access_key?: unknown; type?: unknown; sequence?: unknown; at?: unknown } = {}): ParsedEvent | null {
  const root = xml.includes('http://www.sped.fazenda.gov.br/nfse') ? parseSafe(xml) : null;
  const info = obj(obj(root?.['evento'])['infEvento']); const ped = obj(obj(info['pedRegEvento'])['infPedReg']);
  const detailKey = Object.keys(ped).find(k => /^e\d{6}$/.test(k)); const detail = obj(detailKey ? ped[detailKey] : null);
  const key = str(ped['chNFSe']) ?? str(meta.access_key); const code = detailKey ? detailKey.slice(1) : eventCode(meta.type);
  if (!key || !/^\d{50}$/.test(key) || !code) return null;
  if (root === null && !meta.type) return null;
  const seq = Number(str(info['nSeqEvento']) ?? meta.sequence ?? 1);
  return {
    access_key: key, code, sequence: Number.isInteger(seq) && seq > 0 && seq < 1000 ? seq : 1, adn_type: str(meta.type),
    processed_at: iso(info['dhProc']) ?? iso(meta.at), event_at: iso(ped['dhEvento']), author_document: str(ped['CNPJAutor']) ?? str(ped['CPFAutor']),
    reason_code: str(detail['cMotivo']), reason_text: repairText(str(detail['xMotivo']) ?? str(detail['xProcAdm'])), substitute_key: str(detail['chSubstituta']), xml,
  };
}

type Item = Record<string, unknown>;
const pick = (it: Item, ...names: string[]) => { for (const n of names) if (it[n] !== undefined && it[n] !== null) return it[n]; return undefined; };
export type DistributedItem = { nsu: number | null; document_type: string | null; event_type: string | null; access_key: string | null; generated_at: string | null; nfse?: ParsedNfse; event?: ParsedEvent };
/** Normalizes one ADN LoteDFe item (or Sefin eventos[] item), decoding and reading its XML. */
export async function readDistributed(it: Item): Promise<DistributedItem> {
  const rawNsu = Number(pick(it, 'NSU', 'nsu')); const nsu = Number.isSafeInteger(rawNsu) && rawNsu >= 0 ? rawNsu : null;
  const type = str(pick(it, 'TipoDocumento', 'tipoDocumento')); const evType = str(pick(it, 'TipoEvento', 'tipoEvento'));
  const key = str(pick(it, 'ChaveAcesso', 'chaveAcesso')); const at = iso(pick(it, 'DataHoraGeracao', 'dataHoraGeracao', 'dataHoraRecebimento'));
  const out: DistributedItem = { nsu, document_type: type, event_type: evType, access_key: key && /^\d{50}$/.test(key) ? key : null, generated_at: at };
  const xml = await decodeXml(pick(it, 'Xml', 'xml', 'ArquivoXml', 'arquivoXml'));
  if (!xml) return out;
  const isEvent = type ? /EVENTO/i.test(type) && !/PEDIDO/i.test(type) : evType !== null || /<evento[\s>]/.test(xml);
  if (type && /^NFSE$/i.test(type) || (!type && /<NFSe[\s>]/.test(xml) && !isEvent)) { const n = readNfse(xml); if (n) out.nfse = n; }
  else if (isEvent) { const e = readEvent(xml, { access_key: key, type: evType, sequence: pick(it, 'numeroPedidoRegistroEvento', 'NumeroSequencial'), at }); if (e) out.event = e; }
  return out;
}

/** Events from an ADN (LoteDFe) or Sefin (eventos[] / eventoXml) reply body. */
export async function eventsFromReply(body: unknown): Promise<ParsedEvent[]> {
  const b = obj(body); const list = [...(Array.isArray(b['LoteDFe']) ? b['LoteDFe'] : []), ...(Array.isArray(b['eventos']) ? b['eventos'] : [])] as Item[];
  const out: ParsedEvent[] = [];
  for (const it of list) { const d = await readDistributed(it); if (d.event) out.push(d.event); }
  if (typeof b['eventoXml'] === 'string') { const xml = await decodeXml(b['eventoXml']); const e = xml ? readEvent(xml) : null; if (e) out.push(e); }
  return out;
}

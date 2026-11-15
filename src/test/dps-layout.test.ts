// NT 009 release 1 layout: every scenario is built in both profiles and validated against its own official XSD;
// a DPS of one profile must fail the other schema, so a wrong profile can never pass unnoticed.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDps, type DpsInput } from '../lib/dps';
import { chooseDpsLayout, convertDpsLayout, detectDpsLayout, DEFAULT_NT009R1_PRODUCTION_START, type DpsLayout } from '../lib/dps-layout';
import { fixture, examples } from './dps-fixtures';
import { substituteFixture } from './fiscal-event-fixtures';
import { dpsForSending, sendInvoice } from '../lib/invoices.server';
import { callTransmissor } from '../lib/transmissor.server';
import { xmlStore } from './fake-db';
vi.mock('../lib/transmissor.server', () => ({ callTransmissor: vi.fn(), TransmissorError: class extends Error {} }));

const layouts: DpsLayout[] = ['nt004', 'nt009r1'];
function scenarios(): Record<string, DpsInput> {
  const out: Record<string, DpsInput> = { ...examples() };
  const noCustomer = fixture(); noCustomer.customer = null; out['sem-tomador'] = noCustomer;
  const withheld = fixture(); withheld.service.withholding = 2; withheld.fiscal.withheldRate = '2.00'; out['iss-retido'] = withheld;
  const mei = fixture(); mei.fiscal = { simples: 2, regime: null, special: 0, approximate: { mode: 'none' } }; out['mei'] = mei;
  const both = fixture(); both.values = { service: '150.00', unconditional: '10.00', conditional: '5.00' }; out['dois-descontos'] = both;
  out['substituicao'] = substituteFixture();
  return out;
}
const run = (args: string[]) => execFileSync('python3', ['src/test/validate-dps-xsd.py', ...args], { encoding: 'utf8', stdio: 'pipe' });

describe('Perfis de leiaute da DPS', () => {
  it('cada cenário valida no XSD do seu perfil e falha no do outro', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dps-layout-'));
    try {
      const all = Object.entries(scenarios());
      for (const layout of layouts) {
        const files = all.map(([name, v]) => { const p = join(folder, `${layout}-${name}.xml`); writeFileSync(p, buildDps(v, layout).xml); return p; });
        expect(run([`--layout=${layout}`, ...files]).match(/XSD 1.01 válido/g)).toHaveLength(files.length);
        const other = layout === 'nt004' ? 'nt009r1' : 'nt004';
        for (const f of files) expect(() => run([`--layout=${other}`, f])).toThrow();
      }
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  it('exemplos publicados conferem com o montador (NT 009 e leiaute anterior)', () => {
    const saved = Object.entries(examples());
    for (const [name, v] of saved) {
      expect(readFileSync(`docs/exemplos/dps/${name}.xml`, 'utf8')).toBe(buildDps(v, 'nt009r1').xml);
      expect(readFileSync(`docs/exemplos/dps/leiaute-anterior/${name}.xml`, 'utf8')).toBe(buildDps(v, 'nt004').xml);
    }
    expect(run(['--layout=nt009r1', ...saved.map(([n]) => `docs/exemplos/dps/${n}.xml`)]).match(/NT 009 release 1, oficial/g)).toHaveLength(saved.length);
  });
  it('NT 009: finNFSe = 0 logo após tpEmit e antes de cLocEmi; cNBS antes de xDescServ', () => {
    const xml = buildDps(examples()['com-nbs'], 'nt009r1').xml;
    expect(xml).toContain('<tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>4212254</cLocEmi>');
    expect(xml).toContain('<cServ><cTribNac>010501</cTribNac><cTribMun>001</cTribMun><cNBS>111032100</cNBS><xDescServ>');
    expect(xml).not.toMatch(/vDedRed|vAjusteBC|<IBSCBS>/);
    const old = buildDps(examples()['com-nbs'], 'nt004').xml;
    expect(old).not.toContain('finNFSe'); expect(old).toContain('</xDescServ><cNBS>111032100</cNBS></cServ>');
  });
  it('a série 900 é aceita pelo padrão oficial do release 1 sem correção em memória', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dps-series-'));
    try { const v = fixture(); v.series = 900; const p = join(folder, 's.xml'); writeFileSync(p, buildDps(v, 'nt009r1').xml); expect(run(['--layout=nt009r1', p])).toContain('oficial'); }
    finally { rmSync(folder, { recursive: true, force: true }); }
  });
  it('conversão entre leiautes é idêntica a montar no leiaute de destino (mesmo número)', () => {
    for (const v of Object.values(scenarios())) for (const from of layouts) for (const to of layouts) {
      const n = { ...v, number: '37' };
      expect(convertDpsLayout(buildDps(n, from).xml, to)).toBe(buildDps(n, to).xml);
      expect(detectDpsLayout(buildDps(n, from).xml)).toBe(from);
    }
  });
  it('leiaute não informado ou desconhecido é recusado', () => { expect(() => buildDps(fixture(), 'nt999' as DpsLayout)).toThrow('Leiaute'); });
});

describe('Escolha do leiaute pela data', () => {
  const before = Date.parse('2026-12-01T02:59:59Z'), at = Date.parse('2026-12-01T03:00:00Z');
  it('homologação usa sempre NT 009', () => { for (const t of [Date.parse('2026-11-15T12:00:00Z'), before, at]) expect(chooseDpsLayout('sandbox', t, DEFAULT_NT009R1_PRODUCTION_START)).toBe('nt009r1'); });
  it('produção troca exatamente em 01/12/2026 00:00 de Brasília', () => { expect(chooseDpsLayout('production', before, DEFAULT_NT009R1_PRODUCTION_START)).toBe('nt004'); expect(chooseDpsLayout('production', at, DEFAULT_NT009R1_PRODUCTION_START)).toBe('nt009r1'); });
  it('data adiada pela administração mantém o leiaute anterior até a nova data', () => { const later = '2027-01-01T03:00:00Z'; expect(chooseDpsLayout('production', at, later)).toBe('nt004'); expect(chooseDpsLayout('production', Date.parse(later), later)).toBe('nt009r1'); });
  it('valor ilegível volta ao padrão oficial', () => { expect(chooseDpsLayout('production', before, 'x')).toBe('nt004'); expect(chooseDpsLayout('production', at, null)).toBe('nt009r1'); });
});

// Invoice row under the dispatch lease, with a base DPS stored in the old layout.
const v = examples()['com-nbs']; const ID = 'DPS421225421122233300018100001000000000000037';
function setup(env: 'sandbox' | 'production', start: string, replace = true, baseLayout: DpsLayout = 'nt004') {
  const x = xmlStore(); const base = buildDps({ ...v, environment: env, number: '1' }, baseLayout).xml; x.seed('invoices', 'inv', 'unsigned_dps', base);
  let i: any = { id: 'inv', organization_id: 'org', company_id: 'co', environment: env, status: 'processing', dispatch_state: 'not_sent', claim_token: null, dps_id: ID, dps_number: 37, external_number_retries: 0 };
  const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { nt009r1_production_starts_at: start, key_version: '1', nonce: 'n', data: 'd' }, error: null }), single: async () => ({ data: i, error: null }), insert: async () => ({ error: null }) };
  const rpc = vi.fn(async (name: string, args: any) => {
    if (name === 'claim_invoice_dispatch') { i = { ...i, claim_token: 'token', dispatch_state: 'sending' }; return { data: [i], error: null }; }
    if (name === 'replace_invoice_dps_base') return { data: replace, error: null };
    i = { ...i, ...args._patch }; return { data: i, error: null };
  });
  return { db: { storage: x.storage, from: (t: string) => t === 'fiscal_xml_files' ? x.refsQuery() : q, rpc } as never, rpc, x, invoice: () => i, base };
}
const expected = (env: 'sandbox' | 'production', layout: DpsLayout) => buildDps({ ...v, environment: env, number: '37' }, layout).xml.replace(/Id="DPS\d+"/, `Id="${ID}"`);

describe('Remontagem antes do envio (mesmo número)', () => {
  beforeEach(() => vi.mocked(callTransmissor).mockReset());
  const after = Date.parse('2026-12-01T03:00:01Z');
  it('produção após a troca: base antiga é remontada no NT 009, gravada e trocada sob o lease', async () => {
    const s = setup('production', DEFAULT_NT009R1_PRODUCTION_START);
    const xml = await dpsForSending(s.db, { ...s.invoice(), claim_token: 'token' }, after);
    expect(xml).toBe(expected('production', 'nt009r1')); expect(xml).toContain('<nDPS>37</nDPS>');
    const call = s.rpc.mock.calls.find(c => c[0] === 'replace_invoice_dps_base'); expect(call?.[1]).toMatchObject({ _id: 'inv', _org: 'org', _token: 'token', _from: 'nt004', _to: 'nt009r1' });
    const stored = await s.x.read((call?.[1] as { _file: { path: string; sha256: string } })._file); expect(detectDpsLayout(stored)).toBe('nt009r1');
  });
  it('produção antes da troca: envia a base sem remontar', async () => {
    const s = setup('production', DEFAULT_NT009R1_PRODUCTION_START);
    expect(await dpsForSending(s.db, { ...s.invoice(), claim_token: 'token' }, Date.parse('2026-11-30T12:00:00Z'))).toBe(expected('production', 'nt004'));
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it('produção com data adiada e base já no NT 009: volta ao leiaute anterior', async () => {
    const s = setup('production', '2027-01-01T03:00:00Z', true, 'nt009r1');
    expect(await dpsForSending(s.db, { ...s.invoice(), claim_token: 'token' }, after)).toBe(expected('production', 'nt004'));
  });
  it('envio real: transmissor recebe a DPS no leiaute vigente (homologação = NT 009)', async () => {
    const s = setup('sandbox', DEFAULT_NT009R1_PRODUCTION_START);
    vi.mocked(callTransmissor).mockResolvedValue({ resposta: { status: 400, corpo_json: { erros: [{ codigo: 'E0160' }] } } } as never);
    await sendInvoice(s.db, s.invoice());
    expect((vi.mocked(callTransmissor).mock.calls[0]?.[1] as { dps_xml: string }).dps_xml).toBe(expected('sandbox', 'nt009r1'));
  });
  it('troca recusada pelo banco: nada é enviado e o envio fica como "não realizado"', async () => {
    const s = setup('sandbox', DEFAULT_NT009R1_PRODUCTION_START, false);
    await sendInvoice(s.db, s.invoice());
    expect(callTransmissor).not.toHaveBeenCalled();
    expect(s.rpc.mock.calls.some(c => c[0] === 'replace_invoice_dps_base')).toBe(true);
    expect(s.invoice().dispatch_state).toBe('not_sent');
  });
  it('caso ambíguo (sem lease de envio): não remonta nem reenvia', async () => {
    const s = setup('sandbox', DEFAULT_NT009R1_PRODUCTION_START);
    s.rpc.mockImplementation(async (name: string) => (name === 'claim_invoice_dispatch' ? { data: [], error: null } : { data: null, error: null }) as never);
    await sendInvoice(s.db, { ...s.invoice(), dispatch_state: 'uncertain', status: 'verifying' });
    expect(callTransmissor).not.toHaveBeenCalled();
    expect(s.rpc.mock.calls.map(c => c[0])).toEqual(['claim_invoice_dispatch']);
  });
  it('sem lease não há remontagem', async () => {
    const s = setup('sandbox', DEFAULT_NT009R1_PRODUCTION_START);
    await expect(dpsForSending(s.db, s.invoice(), after)).rejects.toThrow('DPS_LEASE_AUSENTE');
  });
});

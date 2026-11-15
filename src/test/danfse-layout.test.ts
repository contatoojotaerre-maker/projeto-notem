// DANFSe (NT 008 v1.02) reading both layouts: finNFSe, destination block, CST/cClassTrib and adjustment fields.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateDanfse } from '../lib/danfse.server';
import { parseDanfse } from '../lib/danfse';
import { danfseFixture } from './danfse-fixtures';
import { finNFSeLabel, destinationBlock, ibsCbsClassOf, ibsCbsBaseAdjustmentOf, issBaseAdjustmentOf, dpsBaseAdjustmentOf, DEST_NONE_TEXT, DEST_SAME_TEXT } from '../lib/nfse-layout-read';

// NT 009: finNFSe at the infDPS root, CST/cClassTrib in IBSCBS/valores/trib; earlier: inside IBSCBS and gIBSCBS.
const nt009 = (fin = '0') => danfseFixture().replace('<tpEmit>1</tpEmit>', `<tpEmit>1</tpEmit><finNFSe>${fin}</finNFSe>`).replace('</valores></infDPS>', '</valores><IBSCBS><cIndOp>100501</cIndOp><indDest>0</indDest><valores><trib><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS/></trib></valores></IBSCBS></infDPS>');
const old = () => danfseFixture().replace('</valores></infDPS>', '</valores><IBSCBS><finNFSe>0</finNFSe><cIndOp>100501</cIndOp><indDest>0</indDest><valores><trib><gIBSCBS><CST>200</CST><cClassTrib>200001</cClassTrib></gIBSCBS></trib></valores></IBSCBS></infDPS>');
const dps = (xml: string) => parseDanfse(xml).DPS.infDPS;
async function pdfText(xml: string) {
  const dir = mkdtempSync(join(tmpdir(), 'danfse-')); try { const p = join(dir, 'n.pdf'); writeFileSync(p, await generateDanfse(xml, 'authorized')); return execFileSync('pdftotext', ['-raw', p, '-'], { encoding: 'utf8' }); } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('Leitura tolerante NT 009 × anterior', () => {
  it('finalidade mostra a descrição do domínio nos dois caminhos', () => {
    expect(finNFSeLabel(dps(nt009()))).toBe('NFS-e regular'); expect(finNFSeLabel(dps(old()))).toBe('NFS-e regular');
    expect(finNFSeLabel(dps(nt009('1')))).toBe('NFS-e de crédito'); expect(finNFSeLabel(dps(nt009('2')))).toBe('NFS-e de débito');
    expect(finNFSeLabel(dps(danfseFixture()))).toBe('-');
  });
  it('CST/cClassTrib em valores/trib (NT 009) ou em gIBSCBS (anterior)', () => {
    expect(ibsCbsClassOf(dps(nt009()))).toEqual({ cst: '000', cClassTrib: '000001' });
    expect(ibsCbsClassOf(dps(old()))).toEqual({ cst: '200', cClassTrib: '200001' });
  });
  it('destinatário: próprio tomador com indDest = 0; não identificado só sem indicação; dest na raiz ou no IBSCBS', () => {
    expect(destinationBlock(dps(nt009()))).toEqual({ kind: 'same', text: DEST_SAME_TEXT });
    expect(destinationBlock(dps(old()))).toEqual({ kind: 'same', text: DEST_SAME_TEXT });
    expect(destinationBlock(dps(danfseFixture()))).toEqual({ kind: 'none', text: DEST_NONE_TEXT });
    expect(destinationBlock({ indDest: '1', dest: { CNPJ: '11444777000161', xNome: 'Destino' } }).kind).toBe('person');
    expect(destinationBlock({ IBSCBS: { indDest: '1', dest: { CPF: '52998224725', xNome: 'Destino' } } }).kind).toBe('person');
  });
  it('nomes novos e antigos dos ajustes de base', () => {
    expect(dpsBaseAdjustmentOf({ valores: { vAjusteBC: { vAjusteBCISSQN: '1.00' } } })).toEqual({ vAjusteBCISSQN: '1.00' });
    expect(dpsBaseAdjustmentOf({ valores: { vDedRed: { vDR: '2.00' } } })).toEqual({ vDR: '2.00' });
    expect(issBaseAdjustmentOf({ vCalcAjusteBCISSQN: '3.00' })).toBe('3.00'); expect(issBaseAdjustmentOf({ vCalcDR: '4.00' })).toBe('4.00');
    expect(ibsCbsBaseAdjustmentOf({ vCalcAjusteBCIBSCBS: '5.00' })).toBe('5.00'); expect(ibsCbsBaseAdjustmentOf({ vCalcReeRepRes: '6.00' })).toBe('6.00');
  });
});

describe('DANFSe impresso', () => {
  it('NT 009: finalidade por extenso, destinatário = tomador e CST/cClassTrib impressos', async () => {
    const t = await pdfText(nt009());
    expect(t).toContain('NFS-e regular'); expect(t).not.toContain('código 0');
    expect(t).toContain(DEST_SAME_TEXT); expect(t).not.toContain(DEST_NONE_TEXT);
    expect(t).toContain('000 / 000001');
  });
  it('leiaute anterior: mesmos campos lidos do IBSCBS/gIBSCBS', async () => {
    const t = await pdfText(old());
    expect(t).toContain('NFS-e regular'); expect(t).toContain(DEST_SAME_TEXT); expect(t).toContain('200 / 200001');
  });
  it('nota sem grupo IBS/CBS: destinatário não identificado', async () => {
    expect(await pdfText(danfseFixture())).toContain(DEST_NONE_TEXT);
  });
});

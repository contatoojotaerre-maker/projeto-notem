import { describe,it,expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parseDanfse,ownPisCofins,publicNfseUrl,mask,money } from '../lib/danfse';
import { generateDanfse } from '../lib/danfse.server';
import { danfseFixture,modelKey } from './danfse-fixtures';
describe('DANFSe E2',()=>{
 it('PIS/COFINS até 31/12/2026',()=>{expect(ownPisCofins('2026-12-31')).toBe(true);expect(ownPisCofins('2027-01-01')).toBe(false);});
 it('URL pública confirmada',()=>expect(publicNfseUrl(modelKey)).toBe(`https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=${modelKey}`));
 it('preserva ausente versus zero',()=>{expect(money(undefined)).toBe('-');expect(money('0.00')).toBe('R$ 0,00');});
 it('máscaras',()=>{expect(mask('52998224725')).toBe('529.982.247-25');expect(mask('63642453000131')).toBe('63.642.453/0001-31');});
 it('rejeita DTD',()=>expect(()=>parseDanfse('<!DOCTYPE a>'+danfseFixture())).toThrow());
 for(const variant of ['modelo','homologacao','cancelada','substituida','canhoto','estrangeiro','desconto'])it(`uma página A4: ${variant}`,async()=>{const bytes=await generateDanfse(danfseFixture(variant),variant==='cancelada'?'cancelled':variant==='substituida'?'substituted':'authorized',variant==='canhoto');const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBe(595.28);});
});
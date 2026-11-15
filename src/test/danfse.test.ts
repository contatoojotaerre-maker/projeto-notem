import { describe,it,expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parseDanfse,ownPisCofins,publicNfseUrl,mask,money } from '../lib/danfse';
import { generateDanfse } from '../lib/danfse.server';
import { danfseFixture,modelKey } from './danfse-fixtures';
import { fiscalToDb } from '../lib/api-contract';
import { getInvoicePdf } from '../lib/api-invoices.server';
describe('DANFSe E2',()=>{
 it('PIS/COFINS até 31/12/2026',()=>{expect(ownPisCofins('2026-12-31')).toBe(true);expect(ownPisCofins('2027-01-01')).toBe(false);});
 it('URL pública confirmada',()=>expect(publicNfseUrl(modelKey)).toBe(`https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=${modelKey}`));
 it('preserva ausente versus zero',()=>{expect(money(undefined)).toBe('-');expect(money('0.00')).toBe('R$ 0,00');});
 it('máscaras',()=>{expect(mask('52998224725')).toBe('529.982.247-25');expect(mask('63642453000131')).toBe('63.642.453/0001-31');});
 it('rejeita DTD',()=>expect(()=>parseDanfse('<!DOCTYPE a>'+danfseFixture())).toThrow());
 it('PDF API autorizado retorna arquivo PDF real',async()=>{const i={id:'10000000-0000-4000-8000-000000000001',status:'authorized',company_id:'company',organization_id:'org',authorized_nfse_xml:danfseFixture(),nfse_number:'10'};const q:any={select:()=>q,eq:()=>q,in:()=>q,maybeSingle:async()=>({data:i,error:null})};const r=await getInvoicePdf({db:{from:()=>q},params:{invoiceId:i.id},organization_id:'org',env:'production',setCompany:()=>{}} as never);expect(r.status).toBe(200);expect(r.headers?.['Content-Type']).toBe('application/pdf');expect(new TextDecoder().decode((r.body as Uint8Array).slice(0,5))).toBe('%PDF-');});
 it('canhoto false por padrão e omissão preserva preferência',()=>{const v={simples_nacional:'me_epp' as const,regime_apuracao_simples:'dentro_do_simples' as const,regime_especial:'nenhum' as const,tributos_aproximados:{modo:'percentual_simples' as const,percentual_simples:'6.00'}};const ids={company_id:'10000000-0000-4000-8000-000000000001',organization_id:'20000000-0000-4000-8000-000000000001'};expect(fiscalToDb(v,ids,900).print_danfse_receipt).toBe(false);expect(fiscalToDb(v,ids,900,true).print_danfse_receipt).toBe(true);});
 for(const variant of ['modelo','homologacao','cancelada','substituida','canhoto','estrangeiro','desconto'])it(`uma página A4: ${variant}`,async()=>{const bytes=await generateDanfse(danfseFixture(variant),variant==='cancelada'?'cancelled':variant==='substituida'?'substituted':'authorized',variant==='canhoto');const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBe(595.28);});
});
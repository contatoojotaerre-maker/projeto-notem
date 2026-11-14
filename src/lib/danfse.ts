import { XMLParser, XMLValidator } from 'fast-xml-parser';
export const pdfStatuses = ['authorized','cancelled','cancelled_by_authority','substituted'];
export const publicNfseUrl=(key:string)=>/^\d{50}$/.test(key)?`https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=${key}`:null;
export const ownPisCofins=(competence:string)=>/^\d{4}-\d{2}-\d{2}$/.test(competence)&&competence<='2026-12-31';
export function parseDanfse(xml:string){
 if(xml.length>2_000_000||/<!\s*(DOCTYPE|ENTITY)/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error('XML autorizado inválido.');
 const r=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,processEntities:false}).parse(xml);
 const n=r.NFSe?.infNFSe;
 if(!n||!/^NFS\d{50}$/.test(n['@_Id']??'')||!n.DPS?.infDPS||!xml.includes('http://www.sped.fazenda.gov.br/nfse'))throw new Error('XML autorizado incompleto.');
 return n as Record<string, any>;
}
export const text=(v:unknown)=>v===undefined||v===null||v===''?'-':String(v);
export const money=(v:unknown)=>v===undefined||v===null||v===''?'-':`R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const percent=(v:unknown)=>v===undefined||v===null||v===''?'-':`${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4})}%`;
export function dateXml(v:unknown){const s=text(v);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/);return m?`${m[3]}/${m[2]}/${m[1]}${m[4]?' '+m[4]:''}`:'-';}
export function mask(v:unknown){const s=text(v);return /^\d{14}$/.test(s)?s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):/^\d{11}$/.test(s)?s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'):/^\d{8}$/.test(s)?s.replace(/^(\d{5})(\d{3})$/,'$1-$2'):s;}
import { PDFDocument, rgb, degrees, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { fonts } from '@/assets/danfse-fonts';
import { parseDanfse,text,money,percent,dateXml,mask,ownPisCofins,publicNfseUrl } from './danfse';
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function generateDanfse(xml:string,status:string,receipt=false){
 const n=parseDanfse(xml),d=n.DPS.infDPS,v=d.valores??{},mun=v.trib?.tribMun??{},fed=v.trib?.tribFed??{},b=n.IBSCBS??{},bi=d.IBSCBS??{},bv=b.valores??{},bt=b.totCIBS??{};
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const regular=await pdf.embedFont(bytes(fonts.regular),{subset:true}),bold=await pdf.embedFont(bytes(fonts.bold),{subset:true});
 const page=pdf.addPage([595.28,841.89]);const W=575.28,left=10;let y=832;
 const black=rgb(0,0,0),gray=rgb(.94,.94,.94);const line=(top:number)=>page.drawLine({start:{x:left,y:top},end:{x:left+W,y:top},thickness:.45,color:black});
 function wrap(s:string,font:PDFFont,size:number,width:number){const lines:string[]=[];for(const paragraph of s.split('\n')){let current='';for(const ch of paragraph){if(font.widthOfTextAtSize(current+ch,size)>width&&current){lines.push(current);current='';}current+=ch;}lines.push(current);}return lines;}
 function write(s:string,x:number,top:number,width:number,size=6.5,font=regular){let actual=size;while(actual>4&&wrap(s,font,actual,width).length>70)actual-=.25;const lines=wrap(s,font,actual,width);for(let i=0;i<lines.length;i++)page.drawText(lines[i]??'',{x,y:top-i*(actual+1.1),size:actual,font,color:black});return lines.length*(actual+1.1);}
 function row(cells:[string,unknown][],height=19){const cw=W/cells.length;let h=height;cells.forEach(([label,value],i)=>{const lh=write(label,left+3+i*cw,y-7,cw-6,6,bold);h=Math.max(h,7+lh+write(text(value),left+3+i*cw,y-7-lh,cw-6));});y-=h;}
 function section(title:string,cells:[string,unknown][]=[],height=19){line(y);page.drawRectangle({x:left,y:y-14,width:cells.length?W/(cells.length+1):W,height:14,color:gray});let h=Math.max(height,5+write(title,left+3,y-8,cells.length?W/(cells.length+1)-6:W-6,6.8,bold));if(cells.length){const cw=W/(cells.length+1);cells.forEach(([label,value],i)=>{const lh=write(label,left+(i+1)*cw+3,y-7,cw-6,6,bold);h=Math.max(h,7+lh+write(text(value),left+(i+1)*cw+3,y-7-lh,cw-6));});y-=h;}else y-=16;}
 const logo=await pdf.embedPng(bytes(fonts.logo));page.drawImage(logo,{x:13,y:y-25,width:117,height:25});
 write('DANFSe v2.0\nDocumento Auxiliar da NFS-e',215,y-6,195,9,bold);
 write(`Município: ${text(n.xLocEmi)}${n.emit?.enderNac?.UF?' - '+n.emit.enderNac.UF:''}\nAmbiente Gerador: ${text(n.ambGer)}\nTipo de Ambiente: ${text(d.tpAmb)}`,445,y-4,135,6.3);
 if(String(d.tpAmb)==='2')page.drawText('NFS-e SEM VALIDADE JURÍDICA',{x:198,y:y-32,size:8,font:bold,color:rgb(.8,0,0)});
 y-=38;line(y);const key=String(n['@_Id']).slice(3),url=publicNfseUrl(key);
 const qr=QRCode.create(url??'',{errorCorrectionLevel:'M'});const count=qr.modules.size,scale=44/(count+8),qx=497,qy=y-49;
 for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.modules.get(r,c))page.drawRectangle({x:qx+(c+4)*scale,y:qy+(count-r+3)*scale,width:scale,height:scale,color:black});
 write('A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e',448,y-57,131,5.5);
 row([['CHAVE DE ACESSO DA NFS-e',key]],19);
 // Identificação deixa a coluna direita livre para o QR.
 const idRow=(cells:[string,unknown][])=>{const cw=145;cells.forEach(([l,val],i)=>{write(l,13+i*cw,y-7,cw-7,6,bold);write(text(val),13+i*cw,y-15,cw-7);});y-=20;};
 idRow([['NÚMERO DA NFS-e',n.nNFSe],['COMPETÊNCIA DA NFS-e',dateXml(d.dCompet)],['DATA E HORA DA EMISSÃO DA NFS-e',dateXml(n.dhProc)]]);
 idRow([['NÚMERO DA DPS',d.nDPS],['SÉRIE DA DPS',d.serie],['DATA E HORA DA EMISSÃO DA DPS',dateXml(d.dhEmi)]]);
 row([['EMITENTE DA NFS-e',({'1':'Prestador','2':'Tomador','3':'Intermediário'} as Record<string,string>)[d.tpEmit]??text(d.tpEmit)],['SITUAÇÃO DA NFS-e',status==='substituted'?'Substituída':status.startsWith('cancelled')?'Cancelada':({'100':'NFS-e Gerada','102':'NFS-e de Decisão Judicial','103':'NFS-e Avulsa','107':'NFS-e MEI'} as Record<string,string>)[n.cStat]??text(n.cStat)],['FINALIDADE',bi.finNFSe?`código ${bi.finNFSe}`:'-']],19);
 function person(title:string,p:any,provider=false){const a=p?.enderNac??p?.end??{},national=a.endNac??a,ext=a.endExt??{};section(title,[['CNPJ / CPF / NIF',mask(p?.CNPJ??p?.CPF??p?.NIF)],['Indicador Municipal (Inscrição)',p?.IM],['Telefone',p?.fone]]);row([['Nome / Nome Empresarial',p?.xNome],['Município / Sigla UF',provider?[n.xLocEmi,a.UF].filter(Boolean).join(' / '):ext.xCidade?[ext.xCidade,ext.xEstProvReg,ext.cPais].filter(Boolean).join(' / '):national.cMun],['Código IBGE / CEP',`${text(national.cMun)} / ${mask(national.CEP??ext.cEndPost)}`]]);row([['Endereço',[a.xLgr,a.nro,a.xCpl,a.xBairro].filter(Boolean).join(', ')||'-'],['E-mail',p?.email]]);if(provider)row([['Simples Nacional na Data de Competência',({'1':'Não optante','2':'Optante - MEI','3':'Optante - Microempresa ou Empresa de Pequeno Porte'} as Record<string,string>)[d.prest?.regTrib?.opSimpNac]??text(d.prest?.regTrib?.opSimpNac)],['Regime de Apuração Tributária pelo SN',({'1':'Regime de apuração dos tributos federais e municipal pelo Simples Nacional','2':'Tributos federais pelo SN e ISSQN por fora do SN','3':'Tributos federais e municipal por fora do SN'} as Record<string,string>)[d.prest?.regTrib?.regApTribSN]??text(d.prest?.regTrib?.regApTribSN)]]);}
 person('PRESTADOR / FORNECEDOR',n.emit,true);person('TOMADOR / ADQUIRENTE',d.toma);
 if(bi.dest)person('DESTINATÁRIO',bi.dest);else{line(y);write('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',192,y-7,380,6);y-=10;}
 if(d.interm)person('INTERMEDIÁRIO',d.interm);else{line(y);write('INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',187,y-7,385,6);y-=10;}
 const srv=d.serv?.cServ??{};section('SERVIÇO PRESTADO',[['Código de Tributação Nacional/Municipal',`${text(srv.cTribNac)} / ${text(srv.cTribMun)}`],['Código da NBS',srv.cNBS],['Local da Prestação / Sigla UF / País',`${text(n.xLocPrestacao)} / ${text(d.serv?.locPrest?.cLocPrestacao)} / ${text(d.serv?.locPrest?.cPaisPrestacao)}`]]);
 y-=write(text(n.xTribNac),13,y-6,W-6)+3;write('Descrição do Serviço',13,y-6,W-6,6,bold);y-=13+write(text(srv.xDescServ),13,y-14,W-6);
 section('TRIBUTAÇÃO MUNICIPAL (ISSQN)',[['Tipo de Tributação do ISSQN',({'1':'Operação Tributável','2':'Imunidade','3':'Exportação de serviço','4':'Não incidência'} as Record<string,string>)[mun.tribISSQN]??text(mun.tribISSQN)],['Município / Sigla UF / País de Incidência do ISSQN',`${text(n.xLocIncid)} / ${text(n.cLocIncid)}`]]);
 row([['BC ISSQN',money(n.valores?.vBC)],['Alíquota Aplicada',percent(n.valores?.pAliqAplic)],['Retenção do ISSQN',({'1':'Não Retido','2':'Retido pelo tomador','3':'Retido pelo intermediário'} as Record<string,string>)[mun.tpRetISSQN]??text(mun.tpRetISSQN)],['ISSQN Apurado',money(n.valores?.vISSQN)]]);
 section('TRIBUTAÇÃO FEDERAL (EXCETO CBS)',[['IRRF',money(fed.vRetIRRF)],['Contribuição Previdenciária - Retida',money(fed.vRetCP)],['Contribuições Sociais - Retidas',money(fed.vRetCSLL)]]);
 if(ownPisCofins(d.dCompet))row([['PIS - Débito Apuração Própria',money(fed.piscofins?.vPis)],['COFINS - Débito Apuração Própria',money(fed.piscofins?.vCofins)],['Descrição Contrib. Sociais - Retidas','-']]);
 section('TRIBUTAÇÃO IBS/CBS',[['CST / cClassTrib',`${text(bi.valores?.trib?.gIBSCBS?.CST)} / ${text(bi.valores?.trib?.gIBSCBS?.cClassTrib)}`],['Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF',`${text(bi.cIndOp)} / ${text(b.cLocalidadeIncid)} / ${text(b.xLocalidadeIncid)}`]]);
 row([['Exclusões e Reduções da Base de Cálculo',money(bv.vCalcReeRepRes)],['Base de Cálculo Após Exclusões e Reduções',money(bv.vBC)],['Red. Alíquota IBS / Red. Alíquota CBS',`${percent(bv.uf?.pRedAliqUF)} / ${percent(bv.fed?.pRedAliqCBS)}`],['Alíquota - IBS UF / IBS Mun',`${percent(bv.uf?.pIBSUF)} / ${percent(bv.mun?.pIBSMun)}`]]);
 row([['Alíq. Efetiva Municipal - IBS',percent(bv.mun?.pAliqEfetMun)],['Valor Apurado Municipal - IBS',money(bt.gIBS?.gIBSMunTot?.vIBSMun)],['Alíq. Efetiva Estadual - IBS',percent(bv.uf?.pAliqEfetUF)],['Valor Apurado Estadual - IBS',money(bt.gIBS?.gIBSUFTot?.vIBSUF)]]);
 row([['Valor Total Apurado - IBS',money(bt.gIBS?.vIBSTot)],['Alíquota - CBS',percent(bv.fed?.pCBS)],['Alíquota Efetiva - CBS',percent(bv.fed?.pAliqEfetCBS)],['Valor Total Apurado - CBS',money(bt.gCBS?.vCBS)]]);
 section('VALOR TOTAL DA NFS-e',[['VALOR DA OPERAÇÃO / SERVIÇO',money(v.vServPrest?.vServ)],['Desconto Incondicionado',money(v.vDescCondIncond?.vDescIncond)],['Desconto Condicionado',money(v.vDescCondIncond?.vDescCond)]]);
 row([['Total das Retenções (ISSQN / Federais)',money(n.valores?.vTotalRet)],['VALOR LÍQUIDO DA NFS-e',money(n.valores?.vLiq)],['Total do IBS/CBS','-'],['VALOR LÍQUIDO DA NFS-e + IBS/CBS',money(bt.vTotNF)]]);
 section('INFORMAÇÕES COMPLEMENTARES');const taxes=v.trib?.totTrib??{},spheres=taxes.pTotTrib??taxes.vTotTrib;const fmt=taxes.pTotTrib?percent:money;
 const approx=taxes.pTotTribSN!==undefined?`Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Simples Nacional: ${percent(taxes.pTotTribSN)};`:`Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: ${fmt(spheres?.pTotTribFed??spheres?.vTotTribFed)}; Estaduais: ${fmt(spheres?.pTotTribEst??spheres?.vTotTribEst)}; Municipais: ${fmt(spheres?.pTotTribMun??spheres?.vTotTribMun)};`;
 const remaining=y-(receipt?49:18);const info=[d.serv?.infoCompl?.xInfComp,n.xOutInf,approx].filter(Boolean).join('\n\n');let size=6.5;while(size>4&&wrap(info,regular,size,W-6).length*(size+1.1)>remaining)size-=.25;
 if(wrap(info,regular,size,W-6).length*(size+1.1)>remaining)throw new Error('O conteúdo do XML excede o espaço de uma página do DANFSe.');write(info,13,y-8,W-6,size);
 if(receipt){line(42);rowReceipt();}function rowReceipt(){write('DATA CIENTIFICAÇÃO:',13,35,140,6,bold);write('IDENTIFICAÇÃO E ASSINATURA',160,35,140,6,bold);write(`Nº NFS-e / CHAVE NFS-e\n${text(n.nNFSe)} / ${key}`,308,35,272,6,bold);line(20);for(const x of [10,154,303,585])page.drawLine({start:{x,y:20},end:{x,y:42},thickness:.45,color:black});}
 if(status==='substituted'||status.startsWith('cancelled'))page.drawText(status==='substituted'?'SUBSTITUÍDA':'CANCELADA',{x:95,y:320,size:62,font:bold,color:rgb(.65,.65,.65),opacity:.32,rotate:degrees(35)});
 page.drawRectangle({x:6,y:6,width:583.28,height:829.89,borderColor:black,borderWidth:.8});
 return pdf.save();
}
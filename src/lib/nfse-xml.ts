import { XMLParser, XMLValidator } from 'fast-xml-parser';

export function readAuthorizedNfse(xml: string) {
  if (xml.length > 2_000_000 || /<!\s*(DOCTYPE|ENTITY)/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('XML da NFS-e inválido.');
  const root = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, processEntities: false }).parse(xml);
  const n = root.NFSe; const info = n?.infNFSe;
  if (!n || !info || !/^NFS\d{50}$/.test(info['@_Id'] ?? '') || !info.nNFSe || !info.dhProc || !info.valores?.vLiq) throw new Error('Campos obrigatórios ausentes na NFS-e.');
  if (!xml.includes('http://www.sped.fazenda.gov.br/nfse')) throw new Error('Namespace da NFS-e inválido.');
  const value = (key: string) => info.valores[key] ?? null;
  return { accessKey: String(info['@_Id']).slice(3), number: String(info.nNFSe), authorizedAt: String(info.dhProc), base: value('vBC'), rate: value('pAliqAplic'), iss: value('vISSQN'), net: value('vLiq'), withheld: ['2', '3'].includes(String(info.DPS?.infDPS?.valores?.trib?.tribMun?.tpRetISSQN ?? '1')), xml };
}
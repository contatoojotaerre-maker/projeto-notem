# Documentação oficial da NFS-e Nacional — referência da notem

Arquivos oficiais do Sistema Nacional NFS-e usados como referência pela notem.
Fonte: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
Leiaute vigente: versão 1.01.

## swaggers/
| Arquivo | API | Usada pela notem? |
|---|---|---|
| sefin-nacional.json | Sefin Nacional (emissão, consulta de NFS-e e DPS, eventos) | Sim — API central de emissão |
| parametros-municipais.json | ADN Parâmetros Municipais (convênio, alíquotas, regimes, retenções, benefícios) | Sim — somente consultas (GET) |
| adn-contribuinte.json | ADN Contribuinte (distribuição por NSU, eventos por chave) | Sim — sincronização |
| adn-recepcao.json | ADN Recepção (envio de documentos por sistemas municipais) | Não |
| adn-municipio.json | ADN Município (distribuição para prefeituras) | Não |
| cnc-recepcao.json / cnc-municipio.json / cnc-consulta.json | Cadastro Nacional de Contribuintes | Não (uso exclusivo dos municípios) |

### Endereços (homologação = produção restrita)
- Sefin: https://sefin.producaorestrita.nfse.gov.br/SefinNacional | produção: https://sefin.nfse.gov.br/SefinNacional
- Parâmetros municipais: https://adn.producaorestrita.nfse.gov.br/parametrizacao | produção: https://adn.nfse.gov.br/parametrizacao
- ADN Contribuinte: https://adn.producaorestrita.nfse.gov.br/contribuintes | produção: https://adn.nfse.gov.br/contribuintes (confirmar no portal antes de usar)

### Observações importantes
- Parâmetros municipais e DANFSe foram MOVIDOS da Sefin para o ADN (conforme sefin-nacional.json). O caminho /parametros_municipais citado nos manuais é antigo; vale /parametrizacao/{codigoMunicipio}/convenio.
- A API de DANFSe do governo foi suspensa (NT 008/2026). A notem gera o DANFSe por conta própria.
- Todas as APIs usam TLS com autenticação mútua (certificado ICP-Brasil e-CNPJ da empresa). A DPS deve ser assinada com o certificado do próprio emitente (regra E0718).
- Manifestação (confirmação/rejeição) não tem endpoint de envio para contribuintes nestes swaggers.

## manuais/
Guias oficiais em PDF (contribuintes e municípios). Em caso de divergência, os swaggers prevalecem.

## anexos/
- anexo_i: leiaute e regras de validação da DPS e da NFS-e (códigos de rejeição).
- anexo_ii: leiaute e regras dos eventos (cancelamento, análise fiscal, manifestação, ofício).
- anexo_a: municípios IBGE e países ISO2.
- anexo_b: lista de serviços nacional e NBS.
- anexo-c: indicador de operação IBS/CBS.

## esquemas/
Esquemas XSD oficiais (versões 1.00 e 1.01; usar 1.01).

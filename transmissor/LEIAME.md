# notem-transmissor (v2)

Serviço isolado da notem, publicado no Google Cloud Run (southamerica-east1).
Responsabilidade exclusiva: comunicação fiscal — validar/trancar certificado A1, assinar documentos e conversar com o governo via mTLS (OpenSSL).
O Lovable NUNCA edita esta pasta.

## Segurança
- Sem acesso público: só a conta de serviço do painel (Cloud Run Invoker) pode chamar.
- Sem acesso a banco: a notem guarda o envelope; a chave existe só aqui (Secret Manager → CERT_KEY_V1).
- Certificado e senha só em memória; nunca em log.
- Não monta nem altera o conteúdo fiscal: recebe a DPS pronta da notem, apenas assina e transmite.

## Rotas
Todas recebem `organizacao_id`, `empresa_id` e `envelope` (exceto preparar), e `ambiente` = `homologacao` | `producao`.

| Rota | Função |
|---|---|
| `POST /v1/certificados/preparar` | Valida o A1 e devolve metadados + envelope |
| `POST /v1/municipios/convenio` | Convênio do município (ADN parametrização) |
| `POST /v1/nfse/emitir` | Entrada: `dps_xml` (sem assinatura), opcional `algoritmo_assinatura` (`rsa-sha256` padrão, ou `rsa-sha1`) e `tempo_limite_segundos` (padrão 18, máx. 25). Assina (XMLDSig envelopada, C14N, Reference `#Id` do infDPS, assinatura como último filho de DPS, sem prefixo) e envia a `POST {Sefin}/nfse`. Saída: `dps_assinada` e `resposta` |
| `POST /v1/dps/consultar` | Entrada: `id_dps` (45 caracteres). `GET {Sefin}/dps/{id}` — recupera a chave após falha/tempo esgotado |
| `POST /v1/nfse/consultar` | Entrada: `chave_acesso` (50 dígitos). `GET {Sefin}/nfse/{chave}` |

`resposta`: `{status, tipo_conteudo, ms, corpo_json | corpo_texto}` ou `{erro: TLS | TEMPO_ESGOTADO | CONEXAO, detalhe, ms}`.
Em `corpo_json`, campos `nfseXmlGZipB64`/`eventoXmlGZipB64` já vêm descompactados como `nfseXml`/`eventoXml`.

Sefin: homologação `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional` · produção `https://sefin.nfse.gov.br/SefinNacional`.

Tratamento esperado pela notem: `erro: TEMPO_ESGOTADO/CONEXAO` após o envio ⇒ nota "em verificação" e consulta por `/v1/dps/consultar`; nunca reenviar com outro número.

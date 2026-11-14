# notem-transmissor (v3)

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
| `POST /v1/nfse/evento` | Entrada: `chave_acesso` e `evento_xml` (pedRegEvento v1.01 **sem assinatura**, com `infPedReg Id` = "PRE" + chave + tipo do evento), opcional `algoritmo_assinatura` e `tempo_limite_segundos`. Assina o `infPedReg` (mesmo padrão da DPS, assinatura como último filho de pedRegEvento) e envia a `POST {Sefin}/nfse/{chave}/eventos` com `pedidoRegistroEventoXmlGZipB64`. Recusa (`EVENTO_INVALIDO`) se o Id não corresponder à chave. Saída: `evento_assinado` e `resposta` (em `corpo_json`, `eventoXml` já descompactado) |
| `POST /v1/nfse/evento/consultar` | Entrada: `chave_acesso`, `tipo_evento` (6 dígitos, ex.: 101101) e `num_seq_evento`. `GET {Sefin}/nfse/{chave}/eventos/{tipo}/{seq}` — confirma um evento após falha/tempo esgotado |

`resposta`: `{status, tipo_conteudo, ms, corpo_json | corpo_texto}` ou `{erro: TLS | TEMPO_ESGOTADO | CONEXAO, detalhe, ms}`.
Em `corpo_json`, campos `nfseXmlGZipB64`/`eventoXmlGZipB64` já vêm descompactados como `nfseXml`/`eventoXml`.

Sefin: homologação `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional` · produção `https://sefin.nfse.gov.br/SefinNacional`.

Eventos: o transmissor não monta nem altera o pedido; a notem é responsável pelo conteúdo (tipo, motivo, autor). Mesmo tratamento de ambiguidade: falha após o envio ⇒ consultar o evento antes de reenviar.

Tratamento esperado pela notem: `erro: TEMPO_ESGOTADO/CONEXAO` após o envio ⇒ nota "em verificação" e consulta por `/v1/dps/consultar`; nunca reenviar com outro número.

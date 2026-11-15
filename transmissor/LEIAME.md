# notem-transmissor (v5)

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
| `POST /v1/nfse/evento/consultar` | Entrada: `chave_acesso`, `tipo_evento` (6 dígitos, ex.: 101101) e `num_seq_evento`. `GET {Sefin}/nfse/{chave}/eventos/{tipo}/{seq}` — confirma um evento após falha/tempo esgotado. `num_seq_evento` aceita texto ou número. O governo responde `eventos[].arquivoXml` (base64+gzip); o transmissor mantém o campo e acrescenta `eventos[].xml` já decodificado |

| `POST /v1/adn/dfe` | Entrada: `nsu` (inteiro ≥ 0), opcional `lote` (padrão true) e `cnpj_consulta` (14 dígitos, mesmo CNPJ raiz do certificado). `GET {ADN}/contribuintes/DFe/{NSU}?lote=true` — documentos (NFS-e e eventos) do CNPJ a partir do NSU, em lotes. Em `corpo_json.LoteDFe[]` o campo `ArquivoXml` volta descompactado como `Xml`; demais campos como o ADN envia (`NSU`, `ChaveAcesso`, `TipoDocumento`, `TipoEvento`, `DataHoraGeracao`), além de `StatusProcessamento` (`DOCUMENTOS_LOCALIZADOS` / `NENHUM_DOCUMENTO_LOCALIZADO` / `REJEICAO`), `Alertas` e `Erros` |
| `POST /v1/adn/eventos` | Entrada: `chave_acesso`. `GET {ADN}/contribuintes/NFSe/{chave}/Eventos` — todos os eventos da NFS-e (mesmo formato, XML descompactado) |

ADN contribuintes: homologação `https://adn.producaorestrita.nfse.gov.br/contribuintes` · produção `https://adn.nfse.gov.br/contribuintes`. Respeitar o intervalo mínimo exigido pelo ADN entre consultas sem documentos novos (a notem controla a frequência; o transmissor não guarda estado).

`resposta`: `{status, tipo_conteudo, ms, corpo_json | corpo_texto}` ou `{erro: TLS | TEMPO_ESGOTADO | CONEXAO, detalhe, ms}`.
Em `corpo_json`, campos `nfseXmlGZipB64`/`eventoXmlGZipB64` já vêm descompactados como `nfseXml`/`eventoXml`.

Sefin: homologação `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional` · produção `https://sefin.nfse.gov.br/SefinNacional`.

Eventos: o transmissor não monta nem altera o pedido; a notem é responsável pelo conteúdo (tipo, motivo, autor). Mesmo tratamento de ambiguidade: falha após o envio ⇒ consultar o evento antes de reenviar.

Tratamento esperado pela notem: `erro: TEMPO_ESGOTADO/CONEXAO` após o envio ⇒ nota "em verificação" e consulta por `/v1/dps/consultar`; nunca reenviar com outro número.


## v5 — CNPJ alfanumérico
- `cnpj_esperado`, `cnpj_consulta` e o CNPJ extraído do certificado aceitam o formato alfanumérico da Receita Federal (12 posições `[0-9A-Z]` + 2 dígitos verificadores numéricos), com validação do DV (valor de cada caractere = código ASCII − 48; módulo 11). CNPJ numérico continua aceito.
- `chave_acesso`: 50 posições `[0-9A-Z]`.
- `id_dps`: `DPS` + município (7) + tipo de inscrição e inscrição (`1` + CPF 14 dígitos ou `2` + CNPJ 14 posições alfanuméricas) + série e número (20 dígitos).

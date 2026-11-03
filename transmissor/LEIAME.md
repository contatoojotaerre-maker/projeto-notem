# notem-transmissor

Serviço isolado da notem, publicado no Google Cloud Run (southamerica-east1).
Responsabilidade exclusiva: comunicação fiscal (validar/trancar certificado A1 e conversar com o governo via mTLS).
O Lovable NUNCA edita esta pasta.

## Segurança
- Sem acesso público: só a conta de serviço do painel (papel Cloud Run Invoker) pode chamar.
- Sem acesso a banco: a notem guarda o envelope; a chave existe só aqui (Secret Manager → CERT_KEY_V1).
- Certificado e senha só em memória; nunca em log.

## Rotas (v1)
- `POST /v1/certificados/preparar` — entrada: organizacao_id, empresa_id, cnpj_esperado, pfx_base64, senha.
  Saída: metadados (titular, cnpj, emissor, numero_serie, valido_de, valido_ate) e envelope {versao_chave, nonce, dados}.
  Erros (HTTP 422): SENHA_OU_ARQUIVO_INVALIDO, ARQUIVO_INVALIDO, SEM_CHAVE_PRIVADA, CERTIFICADO_VENCIDO,
  CERTIFICADO_AINDA_NAO_VALIDO, CNPJ_NAO_ENCONTRADO, CNPJ_DIVERGENTE. HTTP 400: REQUISICAO_INVALIDA.
- `POST /v1/municipios/convenio` — entrada: organizacao_id, empresa_id, envelope, codigo_municipio (IBGE 7), ambiente (homologacao|producao).
  Saída: url consultada e resposta do governo {status, tipo_conteudo, corpo, ms} ou {erro: TLS|TEMPO_ESGOTADO|CONEXAO, detalhe, ms}.
  Erro 422: ENVELOPE_INVALIDO (envelope não pertence a esta organização/empresa ou chave desconhecida).

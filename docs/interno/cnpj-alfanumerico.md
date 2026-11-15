# CNPJ alfanumérico — implementação (Fase C, Parte 2)

## Regra única
- `normalizeCnpj` (TS) / `public.normalize_cnpj` (SQL): remove máscara e pontuação, converte para maiúsculas.
- `isValidCnpj` (TS) / `public.is_valid_cnpj` (SQL): 12 posições `[0-9A-Z]` + 2 DV numéricos; valor de cada caractere = ASCII − 48; pesos e módulo 11 do CNPJ numérico; 14 caracteres iguais são inválidos. O banco exige o valor já normalizado (minúsculas são recusadas pela restrição).
- `formatCnpj` (painel) e `mask` (DANFSe): `12.ABC.345/01DE-35`.
- CPF, CEP e telefone continuam com `digits`.

## Formatos dependentes (`src/lib/fiscal-ids.ts` e restrições do banco)
- Chave de acesso: `[0-9]{9}[0-9A-Z]{14}[0-9]{27}`. Id NFS-e: `NFS` + chave. Id DPS: `DPS[0-9]{7}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}`. Pedido de evento: `PRE` + chave + código.
- Defeito do `TSChaveNFSe` oficial: `defeitos-esquema-oficial.md`.

## Onde se aplica
Empresas (painel e API, incluindo filtro `?cnpj=`), tomador PJ, substituição no painel, certificado (`cnpj_esperado` e CNPJ gravado normalizados; o transmissor v5 aceita o formato), prova de posse (`org_proven_cnpj`, `list_org_notes`, políticas `nfse_documents_read` e `adn_cursor_read`), sincronização ADN (`request_adn_sync`, cursor), notas externas/recebidas (`prestador_cnpj`, `tomador_documento`), leitura de NFS-e/eventos/DANFSe, autor de evento e E0812 (raiz de 8 posições), busca de empresas no painel e no seletor de webhooks.

## Leiaute anterior
O XSD de 09/02/2026 só aceita CNPJ, chave e Ids numéricos. Em produção antes da vigência da NT 009, `issueInvoice` recusa com 422 antes de numerar, citando a data configurada; `buildDps(..., 'nt004')` repete a recusa como defesa. `convertDpsLayout` para `nt004` recusa DPS com letras (`DPS_CNPJ_ALFANUMERICO_LEIAUTE_ANTERIOR`) e o envio fica como "não realizado" (só acontece se a data for adiada depois de a DPS ser montada).

## Testes
`src/test/cnpj-alfanumerico.test.ts` (DV, normalização, cadastro, emissão validada no XSD release 1, bloqueio/conversão, chave com letras, defeito do TSChaveNFSe, mensagem de recusa, leitura de NFS-e/DANFSe/ADN/evento) e `src/test/cnpj-alfanumerico.database.sql` (DV/normalização em SQL, restrições, prova de posse, visibilidade de nota externa/recebida, pedido ADN). A matriz de isolamento (`isolation-matrix.database.sql`) deve continuar com 0 falhas.

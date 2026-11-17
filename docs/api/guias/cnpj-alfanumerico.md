---
titulo: CNPJ alfanumérico
ordem: 13
atualizado: 2026-11-17
descricao: Como a notem trata o novo formato de CNPJ com letras, em homologação e produção.
---

# CNPJ alfanumérico

Desde julho de 2026 a Receita Federal pode emitir CNPJ com letras nas 12 primeiras posições (os 2 dígitos verificadores continuam numéricos). Exemplo fictício: `12ABC34501DE35`.

## Na entrada e na resposta
- Os campos de CNPJ aceitam os dois formatos, com ou sem máscara e com letras minúsculas (`12.abc.345/01de-35`). A resposta traz sempre 14 caracteres maiúsculos, sem máscara.
- Os filtros `?cnpj=` e `?prestador_cnpj=` aceitam o mesmo formato.
- A chave de acesso da NFS-e tem 50 posições; as 14 posições do CNPJ do emitente podem conter letras.

## Na emissão
- CNPJ alfanumérico (emitente ou tomador): aceito em homologação. Em produção, só a partir da vigência do leiaute da NT 009; antes dela a nota é recusada antes de numerar (`422 REGRA_DE_NEGOCIO`, campo `empresa.cnpj` ou `tomador.documento`): "CNPJ alfanumérico só pode ser usado em produção a partir da vigência da NT 009 (dd/mm/aaaa)".
- Substituição ou cancelamento de nota cuja chave tem letras: se o governo recusar por falha de esquema da chave (defeito conhecido no esquema oficial), a mensagem é "O governo recusou a chave de acesso com CNPJ alfanumérico por um defeito conhecido no esquema oficial. Tente novamente mais tarde ou use o Portal Nacional." O código e a mensagem originais do governo continuam em `detalhes`.

> [!DICA]
> Em homologação, o CNPJ alfanumérico já pode ser usado em todos os fluxos. Use-o para testar o seu sistema antes da vigência em produção.

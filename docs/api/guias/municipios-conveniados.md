---
titulo: Situação da empresa e municípios
ordem: 5
atualizado: 2026-11-17
descricao: Como saber se a empresa está pronta para emitir e se o município atende o ambiente.
---

# Situação da empresa e municípios

`GET /empresas/{id}/situacao` — calculada para o **ambiente da chave**:
```json
{
  "ambiente": "homologacao",
  "pronta_para_emitir": false,
  "itens": [
    { "item": "empresa_ativa", "ok": true, "mensagem": "Empresa ativa." },
    { "item": "certificado", "ok": true, "mensagem": "Certificado válido até 10/01/2027." },
    { "item": "configuracao_fiscal", "ok": true, "mensagem": "Configuração fiscal completa." },
    { "item": "servico_ativo", "ok": true, "mensagem": "1 serviço ativo." },
    { "item": "municipio", "ok": false, "verificado_em": "2026-11-05T10:00:00-03:00",
      "mensagem": "Homologação indisponível neste município." }
  ]
}
```
- `ok: null` no item `municipio` quando ainda não foi verificado.
- `avisos` lista alertas que **não impedem** a emissão. Antes da data de obrigatoriedade do IBS/CBS do ambiente (padrão 01/01/2027), serviços ativos sem classificação completa geram `{ "item": "classificacao_ibscbs", "mensagem": "Classificação IBS/CBS pendente — obrigatória a partir de 01/01/2027." }`; a partir da data, `classificacao_ibscbs` passa a ser um item de `itens` e bloqueia a emissão enquanto pendente.
- `POST /empresas/{id}/situacao/verificar-municipio` consulta o governo (convênio) e devolve a situação atualizada. Limite: 1 vez por minuto por empresa e ambiente (`429 LIMITE_EXCEDIDO` com `Retry-After`). Exige certificado válido.

Quando `pronta_para_emitir` muda, a notem envia o webhook `empresa.situacao_alterada`. Veja [Eventos](../webhooks/eventos.md).

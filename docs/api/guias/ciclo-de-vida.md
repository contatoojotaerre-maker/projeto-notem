---
titulo: Ciclo de vida da nota
ordem: 7
atualizado: 2026-11-17
descricao: Situações da nota, transições possíveis e o objeto nota completo.
---

# Ciclo de vida da nota

Toda nota passa por algumas situações, mostradas no campo `situacao`. Use a situação para decidir o próximo passo; os webhooks avisam a cada mudança.

```fluxo
processando -> autorizada -> cancelada
processando -> em_verificacao -> autorizada
processando -> rejeitada
autorizada -> cancelamento_em_analise -> cancelada
autorizada -> substituida
autorizada -> cancelada_prefeitura
```

| Situação | O que significa | Próximo passo |
|---|---|---|
| `processando` | a notem está enviando a nota ao governo | aguarde a resposta ou o webhook |
| `em_verificacao` | o governo não respondeu a tempo; a notem pergunta ao governo pelo resultado, sem enviar a nota de novo | aguarde `nota.autorizada` ou `nota.rejeitada` |
| `autorizada` | NFS-e válida | baixe XML/PDF; pode cancelar ou substituir |
| `rejeitada` | o governo recusou a nota; o número usado não é reaproveitado | corrija e emita de novo com outra `Idempotency-Key` |
| `cancelamento_em_analise` | a prefeitura analisa o pedido de cancelamento | aguarde a decisão da prefeitura |
| `cancelada` | cancelamento registrado no governo | nada a fazer |
| `substituida` | uma nota substituta foi autorizada | use a nota em `substituida_por_nota_id` |
| `cancelada_prefeitura` | a prefeitura cancelou a nota por ofício | confira com a prefeitura |

## Objeto `nota`
```json
{
  "id": "UUID",
  "id_externo": "OS-55821",
  "empresa_id": "UUID",
  "ambiente": "producao",
  "situacao": "autorizada",
  "restricoes": [],
  "manifestacao": null,
  "numero": "123",
  "chave_acesso": "42054072211222333000181000000000012326110000000001",
  "serie_dps": "00900",
  "numero_dps": "57",
  "competencia": "2026-11-12",
  "emitida_em": "2026-11-12T10:15:03-03:00",
  "autorizada_em": "2026-11-12T10:15:05-03:00",
  "tomador": { "tipo": "pj", "documento": "99888777000100", "nome": "Cliente Exemplo LTDA" },
  "servico": { "servico_id": "UUID", "codigo_servico": "140101", "descricao": "Vistoria veicular - placa ABC1D23" },
  "valores": {
    "servico": "150.00",
    "desconto_incondicionado": "0.00",
    "desconto_condicionado": "0.00",
    "base_calculo": "150.00",
    "aliquota_iss": null,
    "valor_iss": null,
    "iss_retido": false,
    "valor_liquido": "150.00"
  },
  "local_prestacao": { "codigo_municipio": "4205407", "municipio": "Florianópolis", "uf": "SC" },
  "ibs_cbs": null,
  "erros_governo": [],
  "substitui_nota_id": null,
  "substituida_por_nota_id": null,
  "operacao_pendente": null,
  "cancelamento": null,
  "links": {
    "xml": "https://app.notemfiscal.com.br/api/v1/notas/UUID/xml",
    "pdf": "https://app.notemfiscal.com.br/api/v1/notas/UUID/pdf",
    "consulta_publica": "https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=42054072211222333000181000000000012326110000000001"
  },
  "criada_em": "2026-11-12T10:15:03-03:00",
  "atualizada_em": "2026-11-12T10:15:05-03:00"
}
```

**`situacao`**: `processando`, `em_verificacao`, `autorizada`, `rejeitada`, `cancelamento_em_analise`, `cancelada`, `substituida`, `cancelada_prefeitura`.
**`restricoes`**: ações bloqueadas pela prefeitura (ex.: `["cancelamento"]`).
**`manifestacao`**: `null` ou `{ "tipo": "confirmacao" | "rejeicao" | "confirmacao_tacita", "autor": "tomador" | "prestador" | "intermediario", "em": "...", "motivo": "..." }`.
**`operacao_pendente`**: `null` ou `{ "tipo": "cancelamento" | "analise_cancelamento", "estado": "em_verificacao", "desde": "..." }` enquanto a notem aguarda a confirmação do governo; a `situacao` continua `autorizada` até a confirmação.
**`cancelamento`**: `null` ou o último pedido de cancelamento/análise (detalhes em [Cancelamento](cancelamento.md)).
**`substitui_nota_id` / `substituida_por_nota_id`**: ligação entre a nota substituta e a original.
**`ibs_cbs`**: somente leitura; `null` quando a nota não tem o grupo IBS/CBS. Quando há o grupo, traz os valores **calculados pelo governo** e lidos da nota autorizada: `classificacao` (`cst`, `codigo`), `indicador_operacao`, `consumidor_final`, `localidade_incidencia`, `percentual_redutor`, `base_calculo`, `ajuste_base_calculo`, `ibs_uf`/`ibs_municipal`/`cbs` (`aliquota`, `reducao_aliquota`, `aliquota_efetiva`, `valor`, `diferimento`), `valor_total_ibs`, `valor_total_ibs_cbs` (soma do IBS e da CBS), `valor_total_nota`, créditos presumidos, `receita_bruta_simples` e `versao_calculadora` (estes dois só quando o governo ativar a próxima versão do leiaute). O mesmo objeto aparece em notas externas, notas recebidas e nos webhooks de nota.
Valores de ISS (`aliquota_iss`, `valor_iss`) vêm da nota autorizada pelo governo; ficam `null` quando não destacados (ex.: Simples Nacional sem retenção).

---
titulo: Substituição
ordem: 9
atualizado: 2026-11-17
descricao: Emitir uma nota que substitui outra já autorizada, com as regras E0042, E0060 e E0061.
---

# Substituição

As regras gerais de cancelamento (nota autorizada, um pedido por vez, `Idempotency-Key` obrigatória, justificativa) também valem para a substituição. Veja [Cancelamento](cancelamento.md).

`POST /notas/{id}/substituir` emite uma **nova nota** que substitui a original. Aceita os campos de `POST /notas` (todos opcionais) mais:

| Campo | Valores |
|---|---|
| `motivo` | `desenquadramento_simples`, `enquadramento_simples`, `inclusao_imunidade_isencao`, `exclusao_imunidade_isencao`, `rejeicao_tomador_intermediario`, `outros` |
| `justificativa` | texto de 15 a 255 caracteres |

```json
{
  "motivo": "outros",
  "justificativa": "Correção da descrição do serviço prestado.",
  "descricao": "Vistoria veicular completa - placa ABC1D23"
}
```
- Campos não enviados vêm da nota original (serviço, competência, descrição, tomador, valores, retenção, local da prestação e informações complementares).
- A empresa é sempre a da original; `empresa_id` diferente: `422 REGRA_DE_NEGOCIO` (E0042).
- Antes de numerar, a notem aplica as mesmas validações da emissão e as regras de substituição, conforme a opção do Simples da empresa:
  - **Não optante (E0060)**: não pode mudar competência, código do serviço, código municipal nem local da prestação.
  - **MEI e ME/EPP (E0061)**: não pode mudar o documento do tomador (quando a original o tinha), a competência nem o valor do serviço.
- Respostas iguais às de `POST /notas` (`201`, `202`, `409`, `422`, `503`), sobre a **nova** nota, que traz `substitui_nota_id`.
- A original só passa a `substituida` (com `substituida_por_nota_id`) quando a nova é autorizada; nesse momento são enviados `nota.autorizada` (nova) e `nota.substituida` (original). Rejeitada a nova, a original não muda.

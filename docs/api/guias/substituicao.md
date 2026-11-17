---
titulo: Substituição
ordem: 9
atualizado: 2026-11-17
descricao: Corrigir uma nota autorizada emitindo outra no lugar dela: o que pode mudar e quando a original deixa de valer.
---

# Substituição

As regras gerais de cancelamento (nota autorizada, um pedido por vez, `Idempotency-Key` obrigatória, justificativa) também valem para a substituição. Veja [Cancelamento](cancelamento.md).

Use a substituição para corrigir uma nota autorizada sem cancelá-la antes. `POST /notas/{id}/substituir` emite uma **nova nota** que entra no lugar da original. Aceita os campos de `POST /notas` (todos opcionais), mais:

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
- A empresa é sempre a da original, porque o governo só aceita substituir nota da mesma empresa (E0042 — a nota substituída deve ser da mesma empresa e do mesmo município). `empresa_id` diferente responde `422 REGRA_DE_NEGOCIO`.
- Antes de gerar o número da nova nota, a notem faz as mesmas conferências da emissão e aplica as regras do governo sobre o que pode mudar. Elas dependem da situação da empresa no Simples Nacional:
  - **Fora do Simples** (`nao_optante`): não pode mudar competência, código do serviço, código municipal nem local da prestação (E0060).
  - **MEI e ME/EPP**: não pode mudar o documento do tomador (quando a original o tinha), a competência nem o valor do serviço (E0061).
- Respostas iguais às de `POST /notas` (`201`, `202`, `409`, `422`, `503`), sobre a **nova** nota, que traz `substitui_nota_id`.
- A original só passa a `substituida` (com `substituida_por_nota_id`) quando a nova é autorizada; nesse momento são enviados `nota.autorizada` (nova) e `nota.substituida` (original). Se a nova for recusada, a original continua valendo.

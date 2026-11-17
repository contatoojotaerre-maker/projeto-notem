---
titulo: Idempotência
ordem: 7
atualizado: 2026-11-17
descricao: Reenvio seguro com Idempotency-Key: mesma chave, mesma resposta, nunca uma nota duplicada.
---

# Idempotência

Se a conexão cair no meio de um pedido, você não sabe se ele foi feito. O cabeçalho `Idempotency-Key` resolve isso: você repete o pedido com a mesma chave, e a notem reconhece a repetição e devolve a mesma resposta, sem fazer a operação duas vezes.

- **Como usar.** Gere um valor único por operação (por exemplo, um UUID; até 100 caracteres) e envie no cabeçalho `Idempotency-Key`. Ao repetir, use a mesma chave e o mesmo conteúdo.
- **Onde vale.** Todas as operações que criam, alteram ou excluem (`POST`, `PATCH`, `PUT`, `DELETE`) aceitam a chave.
- **Onde é obrigatória.** Para emitir, cancelar, pedir análise do cancelamento e substituir notas. Nessas operações, uma repetição sem chave poderia gerar nota ou pedido em dobro no governo.
- **Por quanto tempo.** Em geral, a chave vale por 24 horas, por integração e ambiente. Nas operações de nota, ela fica ligada ao pedido para sempre e não pode ser usada em outro pedido.
- **Mesma chave, conteúdo diferente:** `409 IDEMPOTENCIA_CONFLITO`. Para um pedido novo, gere uma chave nova.
- **Repetição enquanto a primeira ainda está em andamento:** `409 CONFLITO`. Nas operações de nota, a resposta é `202` com a nota atual, enquanto o resultado é confirmado.
- **Como reconhecer uma repetição.** A resposta repetida traz o cabeçalho `Idempotent-Replayed: true`.
- **Erros `5xx` não são guardados**, para que você possa tentar de novo com a mesma chave.

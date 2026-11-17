---
titulo: Idempotência
ordem: 7
atualizado: 2026-11-17
descricao: Reenvio seguro com Idempotency-Key: mesma chave, mesma resposta, nunca uma nota duplicada.
---

# Idempotência

- Operações que criam, alteram ou excluem (`POST`, `PATCH`, `PUT`, `DELETE`) aceitam o cabeçalho `Idempotency-Key` (texto de até 100 caracteres, gerado pelo parceiro, ex.: um UUID).
- **Obrigatório** em emissão, cancelamento e substituição de notas.
- Repetir a mesma chave com o **mesmo conteúdo** devolve a **mesma resposta**, sem refazer a operação — inclusive após falha de rede. Com conteúdo diferente: `409 IDEMPOTENCIA_CONFLITO`.
- A chave vale por 24 horas, por integração e ambiente, exceto na emissão (`POST /notas`), no cancelamento, na análise fiscal do cancelamento e na substituição: a associação ao pedido é permanente e a chave não pode ser reutilizada para outro pedido.
- A resposta repetida traz o cabeçalho `Idempotent-Replayed: true`. Enquanto a primeira requisição ainda estiver em andamento, a repetição recebe `409 CONFLITO`, exceto nessas operações de nota, que retornam `202` com a nota atual enquanto o resultado é confirmado. Respostas `5xx` não são guardadas, para que você possa tentar de novo com a mesma chave.
- Disponível em todas as rotas de escrita da v1.

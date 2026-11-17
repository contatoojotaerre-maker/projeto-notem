---
titulo: Limites de uso
ordem: 5
atualizado: 2026-11-17
descricao: Quantas chamadas cada chave pode fazer por minuto, por tipo de operação, e o que fazer ao receber 429.
---

# Limites de uso

Os limites contam **por chave e por ambiente** (homologação e produção são independentes), salvo indicação. Ao exceder, a resposta é `429 LIMITE_EXCEDIDO` com o cabeçalho `Retry-After` (segundos até poder tentar de novo).

<!-- notem:limites -->

- Os valores acima são os iniciais. A notem pode ajustá-los para uma organização específica; nesse caso o ajuste vale para todas as chaves dela.
- Operações simultâneas acima do permitido também recebem `429` (com `Retry-After: 5`). Reenvie com a **mesma** `Idempotency-Key`.
- Corpo da requisição: no máximo 200 KB; acima disso, `413 REQUISICAO_INVALIDA`.

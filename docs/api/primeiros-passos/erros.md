---
titulo: Erros
ordem: 6
atualizado: 2026-11-17
descricao: Formato único de erro, códigos estáveis e o que cada status significa.
---

# Erros

Todo erro tem **sempre** o mesmo formato:

```json
{
  "erro": {
    "codigo": "REQUISICAO_INVALIDA",
    "mensagem": "Explicação em português, pronta para mostrar ao usuário.",
    "detalhes": [{ "campo": "tomador.cnpj", "mensagem": "CNPJ inválido." }],
    "codigo_governo": null,
    "mensagem_governo": null
  },
  "id_requisicao": "req_..."
}
```

- `codigo`: código estável da notem (lista abaixo). Use-o na lógica do seu sistema; a `mensagem` pode mudar de redação.
- `detalhes[].campo` é estável; `detalhes[].mensagem` é sempre em português, escrita pela notem, e pode ser melhorada. Não compare textos de mensagem no seu sistema.
- Identificadores (`id`, `empresa_id`, `tomador_id` etc.) são UUID no padrão RFC 9562, no corpo, na consulta e no caminho. Fora do padrão: `400 REQUISICAO_INVALIDA` com o `campo` correspondente. Um UUID válido que não existe ou é de outra organização continua `404 NAO_ENCONTRADO`.
- `codigo_governo` / `mensagem_governo`: preenchidos quando o erro veio do governo (ex.: `E0014`).
- `id_requisicao`: também enviado no cabeçalho `X-Request-Id` de **toda** resposta. Informe-o ao suporte.

| Status | Código | Quando |
|---|---|---|
| 400 | `REQUISICAO_INVALIDA` | formato ou campo inválido |
| 401 | `AUTENTICACAO_INVALIDA` | chave ausente, inválida ou revogada |
| 403 | `SEM_PERMISSAO` | a integração não pode fazer esta operação |
| 404 | `NAO_ENCONTRADO` | recurso inexistente ou de outra organização |
| 409 | `CONFLITO` | estado atual não permite a operação |
| 409 | `IDEMPOTENCIA_CONFLITO` | mesma `Idempotency-Key` com conteúdo diferente |
| 422 | `REGRA_DE_NEGOCIO` | dados válidos, mas a operação viola uma regra (inclui validações fiscais prévias) |
| 422 | `REJEITADO_GOVERNO` | o governo recusou (ver `codigo_governo`) |
| 429 | `LIMITE_EXCEDIDO` | muitas requisições; aguarde (cabeçalho `Retry-After`) |
| 502/503 | `GOVERNO_INDISPONIVEL` | serviço do governo fora do ar ou lento |
| 500 | `ERRO_INTERNO` | falha da notem; tente novamente com a mesma `Idempotency-Key` |

Códigos específicos de cada rota (ex.: `CERTIFICADO_VENCIDO`) são documentados na própria rota.

As recusas do governo e a orientação prática de cada código estão em [Rejeições do governo](../referencia/rejeicoes-do-governo.md).

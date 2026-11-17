---
titulo: Cancelamento
ordem: 8
atualizado: 2026-11-17
descricao: Cancelar uma NFS-e autorizada, pedir análise fiscal à prefeitura e acompanhar o pedido.
---

# Cancelamento

## Regras gerais
- Somente nota **autorizada** pode ser cancelada, ter análise solicitada ou ser substituída. Outras situações: `409 CONFLITO`.
- Apenas **um pedido por vez** em cada nota: com cancelamento ou análise aguardando confirmação, ou com nota substituta em processamento, novos pedidos recebem `409 CONFLITO`.
- `Idempotency-Key` é **obrigatória**. A associação entre a chave e o pedido é permanente: repetir a mesma chave e o mesmo conteúdo devolve o mesmo pedido, sem novo envio ao governo; conteúdo diferente: `409 IDEMPOTENCIA_CONFLITO`.
- `justificativa`: 15 a 255 caracteres, depois do ajuste automático de texto ([Texto aceito pela NFS-e](../primeiros-passos/requisicoes.md#texto-aceito-pela-nfs-e)). Caracteres sem equivalente (ex.: emojis): `422 REGRA_DE_NEGOCIO`, campo `justificativa`, mensagem "contém caracteres não aceitos pela NFS-e".
- Antes de enviar, a notem confere se o certificado ativo da empresa corresponde ao CNPJ da nota (E0812). Sem certificado ativo: `422 EMPRESA_NAO_PRONTA`.
- Se a resposta do governo demorar ou a conexão cair, o pedido **nunca é reenviado às cegas**: a notem consulta o governo até confirmar. Enquanto isso a nota continua `autorizada` e traz `operacao_pendente`.

## Cancelar — `POST /notas/{id}/cancelar`
```json
{ "motivo": "erro_emissao", "justificativa": "Valor do serviço informado incorretamente." }
```
| Campo | Valores |
|---|---|
| `motivo` | `erro_emissao`, `servico_nao_prestado`, `outros` |
| `justificativa` | texto de 15 a 255 caracteres |

| Resultado | Status | Corpo |
|---|---|---|
| Cancelamento registrado | `200` | objeto `nota` com `situacao: "cancelada"` |
| Aguardando confirmação do governo | `202` | objeto `nota` (`situacao: "autorizada"`, `operacao_pendente` preenchido). A notem confirma sozinha e avisa por webhook |
| Recusado pelo governo | `422 REJEITADO_GOVERNO` | `detalhes` com código e mensagem originais e explicação em português |
| Validação antes do envio | `400` / `422 REGRA_DE_NEGOCIO` / `422 EMPRESA_NAO_PRONTA` | nada é enviado |
| Pedido não enviado | `503 GOVERNO_INDISPONIVEL` | repita com a mesma `Idempotency-Key` |

**Quando o município não permite cancelar diretamente** (prazo expirado — E0822, valor acima do limite — E0823, tomador não identificado — E0824, tributos recolhidos — E0827), cada item de `detalhes` traz `"pode_solicitar_analise": true` e a nota passa a ter `cancelamento.pode_solicitar_analise: true`. Use a [rota de análise fiscal](op:solicitarAnaliseCancelamento).

**Cancelamento feito fora da notem**: se o governo recusar porque a nota já tem evento de cancelamento (E0840 ou equivalente), a notem consulta o evento de cancelamento registrado. Encontrado, guarda o XML oficial, a nota passa a `cancelada`, o histórico registra "Cancelamento registrado fora da notem", a resposta é `200` e o webhook `nota.cancelada` é enviado (com `cancelamento.registrado_fora_da_notem: true` e o motivo/justificativa oficiais). Não encontrado, a recusa segue normalmente.

**Sem confirmação**: se após 15 minutos o governo informar que não há registro do pedido, a nota segue `autorizada`, `operacao_pendente` volta a `null` e `cancelamento.situacao` fica `nao_registrado`. Você pode pedir de novo com outra `Idempotency-Key`.

## Solicitar análise fiscal — `POST /notas/{id}/solicitar-analise-cancelamento`
Mesmo corpo, regras e respostas do cancelamento. Registrado o pedido, a nota fica `cancelamento_em_analise` e o webhook `nota.cancelamento_em_analise` é enviado. A decisão da prefeitura (deferimento ou indeferimento) ainda não é acompanhada automaticamente pela notem; até lá a nota permanece em análise.

## Objeto `cancelamento` na nota
```json
{
  "tipo": "cancelamento",
  "motivo": "erro_emissao",
  "justificativa": "Valor do serviço informado incorretamente.",
  "solicitado_em": "2026-11-13T09:20:38-03:00",
  "registrado_em": "2026-11-13T09:20:40-03:00",
  "situacao": "cancelado",
  "pode_solicitar_analise": false,
  "registrado_fora_da_notem": false,
  "erros_governo": []
}
```
| Campo | Significado |
|---|---|
| `tipo` | `cancelamento` ou `analise_cancelamento` |
| `situacao` | `em_verificacao`, `cancelado`, `em_analise`, `recusado`, `nao_registrado`, `nao_enviado` |
| `pode_solicitar_analise` | `true` após recusa por E0822, E0823, E0824 ou E0827 |
| `registrado_fora_da_notem` | `true` quando o cancelamento foi confirmado no governo, mas feito fora da notem |

`GET /notas/{id}/eventos/101101/xml` (cancelamento) e `GET /notas/{id}/eventos/101103/xml` (análise fiscal) baixam o XML oficial do evento registrado; sem evento registrado: `404`.

A orientação para cada recusa do governo (E0822, E0840, E0812 e outras) está em [Rejeições do governo](../referencia/rejeicoes-do-governo.md).

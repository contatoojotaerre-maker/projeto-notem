---
titulo: Cancelamento
ordem: 8
atualizado: 2026-11-17
descricao: Cancelar uma NFS-e autorizada, pedir análise fiscal à prefeitura e acompanhar o pedido.
---

# Cancelamento

## Regras gerais
- **Só nota autorizada pode ser cancelada.** O mesmo vale para pedir análise ou substituir. Nota em outra situação responde `409 CONFLITO`.
- **Um pedido por vez em cada nota.** Enquanto um cancelamento ou uma análise espera a confirmação do governo, ou enquanto uma nota substituta está sendo emitida, novos pedidos para a mesma nota respondem `409 CONFLITO`. Isso evita pedidos contraditórios no governo.
- **`Idempotency-Key` é obrigatória.** Repetir a mesma chave com o mesmo conteúdo devolve o mesmo pedido, sem enviar outro ao governo. A chave fica ligada ao pedido para sempre; com conteúdo diferente, a resposta é `409 IDEMPOTENCIA_CONFLITO`.
- **A justificativa tem de 15 a 255 caracteres**, contados depois do ajuste automático de texto ([Texto aceito pela NFS-e](../primeiros-passos/requisicoes.md#texto-aceito-pela-nfs-e)). Caracteres sem equivalente, como emojis, são recusados com `422 REGRA_DE_NEGOCIO`, campo `justificativa` e a mensagem "contém caracteres não aceitos pela NFS-e".
- **O certificado da empresa precisa ser do CNPJ da nota**, porque o pedido é assinado com ele (E0812 — o CNPJ do certificado não corresponde ao emitente da nota). A notem confere antes de enviar. Sem certificado ativo, a resposta é `422 EMPRESA_NAO_PRONTA`.
- **Sem resposta do governo, a notem não repete o pedido às cegas.** Ela consulta o governo até saber o resultado. Enquanto isso, a nota continua `autorizada` e traz `operacao_pendente`.

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

**Cancelamento feito fora da notem**: se o governo recusar porque a nota já tem um registro que impede o cancelamento (E0840 — a nota já tem um evento que impede o cancelamento), a notem procura no governo um cancelamento já feito, por exemplo pelo Portal Nacional. Se encontrar, guarda o XML oficial, a nota passa a `cancelada`, o histórico registra "Cancelamento registrado fora da notem", a resposta é `200` e o webhook `nota.cancelada` é enviado (com `cancelamento.registrado_fora_da_notem: true` e o motivo/justificativa oficiais). Se não encontrar, a recusa segue normalmente.

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
| `pode_solicitar_analise` | `true` quando o município não permite cancelar diretamente (prazo, valor, tomador não identificado ou tributos recolhidos) |
| `registrado_fora_da_notem` | `true` quando o cancelamento foi confirmado no governo, mas feito fora da notem |

`GET /notas/{id}/eventos/101101/xml` (cancelamento) e `GET /notas/{id}/eventos/101103/xml` (análise fiscal) baixam o XML oficial do evento registrado; sem evento registrado: `404`.

O significado de cada recusa do governo e o que fazer em cada caso estão em [Rejeições do governo](../referencia/rejeicoes-do-governo.md).

# API da notem — Cancelamento, análise fiscal e substituição

Leia antes `convencoes.md` e `notas.md`. Todas as rotas usam a chave da integração; a nota deve ser da organização e do ambiente da chave (caso contrário, `404`).

## Regras gerais
- Somente nota **autorizada** pode ser cancelada, ter análise solicitada ou ser substituída. Outras situações: `409 CONFLITO`.
- Apenas **um pedido por vez** em cada nota: com cancelamento ou análise aguardando confirmação, ou com nota substituta em processamento, novos pedidos recebem `409 CONFLITO`.
- `Idempotency-Key` é **obrigatória**. A associação entre a chave e o pedido é permanente: repetir a mesma chave e o mesmo conteúdo devolve o mesmo pedido, sem novo envio ao governo; conteúdo diferente: `409 IDEMPOTENCIA_CONFLITO`.
- `justificativa`: 15 a 255 caracteres, depois do ajuste automático de texto (`convencoes.md`, seção 4.1). Caracteres sem equivalente (ex.: emojis): `422 REGRA_DE_NEGOCIO`, campo `justificativa`, mensagem "contém caracteres não aceitos pela NFS-e".
- Antes de enviar, a notem confere se o certificado ativo da empresa corresponde ao CNPJ da nota (E0812). Sem certificado ativo: `422 EMPRESA_NAO_PRONTA`.
- Se a resposta do governo demorar ou a conexão cair, o pedido **nunca é reenviado às cegas**: a notem consulta o governo até confirmar. Enquanto isso a nota continua `autorizada` e traz `operacao_pendente`.

## 1. Cancelar — `POST /notas/{id}/cancelar`
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

**Quando o município não permite cancelar diretamente** (prazo expirado — E0822, valor acima do limite — E0823, tomador não identificado — E0824, tributos recolhidos — E0827), cada item de `detalhes` traz `"pode_solicitar_analise": true` e a nota passa a ter `cancelamento.pode_solicitar_analise: true`. Use a rota de análise fiscal (seção 2).

**Cancelamento feito fora da notem**: se o governo recusar porque a nota já tem evento de cancelamento (E0840 ou equivalente), a notem consulta o evento de cancelamento registrado. Encontrado, guarda o XML oficial, a nota passa a `cancelada`, o histórico registra "Cancelamento registrado fora da notem", a resposta é `200` e o webhook `nota.cancelada` é enviado (com `cancelamento.registrado_fora_da_notem: true` e o motivo/justificativa oficiais). Não encontrado, a recusa segue normalmente.

**Sem confirmação**: se após 15 minutos o governo informar que não há registro do pedido, a nota segue `autorizada`, `operacao_pendente` volta a `null` e `cancelamento.situacao` fica `nao_registrado`. Você pode pedir de novo com outra `Idempotency-Key`.

## 2. Solicitar análise fiscal — `POST /notas/{id}/solicitar-analise-cancelamento`
Mesmo corpo, regras e respostas do cancelamento. Registrado o pedido, a nota fica `cancelamento_em_analise` e o webhook `nota.cancelamento_em_analise` é enviado. A decisão da prefeitura (deferimento ou indeferimento) ainda não é acompanhada automaticamente pela notem; até lá a nota permanece em análise.

## 3. Substituir — `POST /notas/{id}/substituir`
Emite uma **nova nota** que substitui a original. Aceita os campos de `POST /notas` (todos opcionais) mais:

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

## 4. Objeto `cancelamento` na nota
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

## 5. Orientações para recusas
| Código | Orientação |
|---|---|
| E0822 / E0823 / E0824 / E0827 | O município não permite o cancelamento direto; solicite a análise fiscal |
| E0840 / E0848 | Já existe evento que impede o pedido (ex.: análise pendente ou confirmação do tomador); confira o histórico da nota no Portal Nacional |
| E0812 | O certificado da empresa não corresponde ao CNPJ da nota |
| E0068 | Análise fiscal pendente impede a substituição |
| E0070 / E0072 | Confirmação do tomador (expressa ou tácita) impede a substituição |
| E0046 | Nota cancelada não pode ser substituída |
| E0050 / E0056 / E0058 / E0074 | Regras do município para substituição (prazo, tomador, tributos recolhidos) |

Os detalhes preservam código, mensagem e complemento originais do governo.

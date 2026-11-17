---
titulo: Notas recebidas e sincronização
ordem: 12
atualizado: 2026-11-17
descricao: Notas emitidas fora da notem, notas em que a empresa é tomadora e a sincronização com o Ambiente de Dados Nacional.
---

# Notas recebidas e sincronização

A notem traz do Ambiente de Dados Nacional (ADN) as notas de cada empresa que foram emitidas **fora da notem** (outro sistema ou Portal Nacional) e as notas em que a empresa é **tomadora ou intermediária**. Também traz os eventos registrados depois da emissão (cancelamentos, análises fiscais, ações da prefeitura).

## Como a sincronização acontece
- A sincronização é **iniciada apenas no painel**, por empresa, no ambiente escolhido no topo do painel (aba **Sincronização** da empresa), por proprietário ou administrador da organização. A API **não** oferece sincronização; ela só consulta a situação.
- Opções: períodos de 1, 3, 6, 12 ou 24 meses (padrão 1 mês). Depois da primeira sincronização concluída aparece também "Novidades desde a última sincronização".
- O governo exige **1 hora** de intervalo depois de uma consulta sem documentos novos. Durante esse intervalo o botão fica desabilitado e `proxima_consulta_permitida` mostra quando será possível sincronizar de novo.
- Para começar um período, a notem localiza o primeiro documento do período pela data de geração, com no máximo 25 consultas espaçadas em pelo menos 2 segundos. Se o governo indicar consumo indevido ou rejeitar a consulta, a sincronização é interrompida e o motivo aparece em `ultimo_erro`.
- Requisito: a empresa precisa ter certificado digital cadastrado na organização (prova de posse do CNPJ). Sem isso, notas externas e recebidas não aparecem.

## Eventos posteriores
Eventos registrados depois da emissão chegam à notem por três caminhos: a sincronização feita no painel; o botão "Atualizar com o governo" de cada nota; e a **verificação diária automática**, que consulta uma vez por dia apenas as notas emitidas pela notem com cancelamento pendente (em análise ou em verificação). Quando um evento muda a nota, o webhook correspondente é enviado (veja [Eventos](../webhooks/eventos.md)).

## Rotas
| Rota | Descrição |
|---|---|
| `GET /empresas/{id}/sincronizacao` | Situação da sincronização no ambiente da chave |
| `GET /empresas/{id}/notas-recebidas` | Lista paginada. Filtros: `situacao`, `prestador_cnpj` (14 posições, numérico ou alfanumérico), `emitida_de`, `emitida_ate` |
| `GET /empresas/{id}/notas-recebidas/{nota_id}` | Nota recebida |
| `GET /empresas/{id}/notas-recebidas/{nota_id}/xml` | XML oficial, sem alterações |
| `GET /empresas/{id}/notas-recebidas/{nota_id}/pdf` | DANFSe gerado do XML oficial |
| `GET /notas?origem=externa` | Notas emitidas fora da notem (veja [Emissão de notas](emissao.md)) |

Empresa de outra organização, nota de outro ambiente ou empresa sem prova de posse respondem `404 NAO_ENCONTRADO`.

## Objeto `sincronizacao`
```json
{
  "ambiente": "producao",
  "situacao": "atualizada",
  "ultimo_nsu": 13,
  "ultima_consulta": "2026-11-15T09:00:02-03:00",
  "proxima_consulta_permitida": "2026-11-15T10:00:02-03:00",
  "primeira_sincronizacao_concluida_em": "2026-11-14T17:08:00-03:00",
  "documentos_importados": 13,
  "sincronizacao_em_andamento": null,
  "ultima_sincronizacao": { "tipo": "periodo", "meses": 1, "resultado": "concluida", "concluida_em": "2026-11-15T09:00:02-03:00", "documentos_importados": 0, "mensagem": null },
  "ultimo_erro": null,
  "verificacao_diaria": { "ultima_execucao": "2026-11-15T06:00:40-03:00", "notas_verificadas": 1, "notas_atualizadas": 0 }
}
```
`situacao`: `nunca_sincronizada`, `em_andamento`, `atualizada` ou `erro`. Em andamento, `sincronizacao_em_andamento.etapa` é `busca_inicio_periodo` ou `importacao`.

## Objeto `nota_recebida`
Mesmo formato do objeto `nota` para número, chave, datas, tomador, serviço, valores e cancelamento, acrescido de:
- `papel`: `tomador` ou `intermediario`;
- `prestador`: `{ "cnpj", "nome" }`; `intermediario`: `{ "documento", "nome" }` ou `null`;
- `origem`: `notem` quando a nota foi emitida pela notem por outra organização, `externa` nos demais casos.

Notas recebidas são somente leitura.

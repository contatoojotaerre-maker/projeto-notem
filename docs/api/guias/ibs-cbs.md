---
titulo: IBS/CBS
ordem: 11
atualizado: 2026-11-17
descricao: Classificação IBS/CBS dos serviços, quando o grupo vai na nota e as recusas do governo.
---

# IBS/CBS

## IBS/CBS do serviço (`classificacao_ibscbs`)

A notem envia ao governo **somente a classificação**; alíquotas, base e valores do IBS/CBS são calculados pelo governo e devolvidos na nota autorizada (objeto `ibs_cbs`, veja [Ciclo de vida da nota](ciclo-de-vida.md)).

| Campo | Regra |
|---|---|
| `codigo_classificacao` | cClassTrib de 6 dígitos (ver `/catalogos/classificacoes-tributarias`). Ainda não suportadas: tributação regular, crédito presumido, diferimento, CST 800/811 e doações 410003/410026 |
| `indicador_operacao` | cIndOp (ver `/catalogos/indicadores-operacao`): **obrigatório** quando a classificação exige tributação (E0860) e **proibido** quando não exige (E0859). Indicadores retirados do Anexo VII v1.03 não podem ser escolhidos; os já gravados aparecem com `situacao: "a_revisar"` |
| `consumidor_final` | `true` envia `indFinal = 1` |
| `atividade_simples` | só ME/EPP: `07`–`14` ou `90`. `10` somente com 16.01; `11` somente com 99.04.01; `12`/`13` somente com 7.02 e 7.05. Enviada a partir do próximo leiaute |
| `cst`, `descricao`, `situacao` | somente leitura (`completa`, `pendente`, `a_revisar`) |

- Serviços dos subitens 99.03, 99.04, 99.05 e 25.05, 15.09, 17.12, 10.05 ainda não aceitam classificação.
- Quando o indicador aponta para o endereço do tomador ou do destinatário, a nota exige tomador com CPF/CNPJ e endereço no Brasil (E0239/E0243). **O município do tomador deve ser o mesmo do cadastro na Receita Federal.**
- `indicador_operacao_ibscbs` está **obsoleto**: continua aceito e devolvido (espelha `classificacao_ibscbs.indicador_operacao`); se enviado com valor diferente do de `classificacao_ibscbs.indicador_operacao`, responde `422 REGRA_DE_NEGOCIO`.
- `GET /catalogos/sugestao-classificacao?codigo_servico=010501` devolve a sugestão da tabela oficial de correlação (Anexo VIII). Ela **nunca é aplicada automaticamente**; valores não aceitos, retirados ou não suportados vêm com `aplicavel: false` e o motivo.

## IBS/CBS na emissão

- O grupo IBS/CBS vai na DPS **somente** quando a competência for igual ou posterior à data de obrigatoriedade do ambiente (padrão **01/01/2027**, configurável pela administração da notem por ambiente). Antes dela, a nota sai sem o grupo, mesmo com o serviço classificado.
- A partir da data, o serviço precisa ter `codigo_nbs` e `classificacao_ibscbs` completos. Todas as regras são conferidas **antes de gerar o número da nota** (`422 REGRA_DE_NEGOCIO`, sem consumir número DPS): NBS obrigatório (E0322), CST igual aos 3 primeiros dígitos da classificação (E0959), indicador conforme a classificação (E0859/E0860), tomador com CPF/CNPJ e endereço no Brasil quando o indicador aponta para o endereço do tomador/destinatário (E0239/E0243) e casos ainda não suportados.
- O município do tomador deve ser o mesmo do cadastro na Receita Federal; a recusa do governo por essa divergência é devolvida com `campo: "tomador.endereco.codigo_municipio"`.
- Se o leiaute em vigor no ambiente ainda não tiver o grupo IBS/CBS, a nota é recusada antes de gerar o número da nota (`campo: "competencia"`).
- Rejeições do governo traduzidas: E0855, E0322, E0859, E0860, E0958, E0959, E0960, E0961, E0239, E0243 e a divergência do município do tomador.

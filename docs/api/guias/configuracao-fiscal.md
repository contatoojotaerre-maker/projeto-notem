---
titulo: Configuração fiscal
ordem: 3
atualizado: 2026-11-26
descricao: Como informar Simples Nacional, regimes, tributos aproximados e PIS/COFINS opcional por empresa.
---

# Configuração fiscal

`GET /empresas/{id}/configuracao-fiscal` · `PUT /empresas/{id}/configuracao-fiscal`

> **Atenção ao PUT: reenvie SEMPRE `pis_cofins` em cada PUT para manter a configuração.** O PUT substitui a configuração fiscal inteira. Se você omitir `pis_cofins` ou enviar `null`, a configuração anterior de PIS/COFINS será removida, mesmo que o pedido altere outro campo. A exceção já existente de `imprimir_canhoto_danfse` continua preservando essa preferência quando ausente; a série continua somente leitura.

```json
{
  "simples_nacional": "me_epp",
  "regime_apuracao_simples": "dentro_do_simples",
  "regime_especial": "nenhum",
  "pis_cofins": { "cst": "99", "tipo_retencao": "0" },
  "tributos_aproximados": {
    "modo": "percentual_simples",
    "percentual_simples": "6.00",
    "federal": null,
    "estadual": null,
    "municipal": null
  },
  "aliquota_iss_simples": null,
  "regime_apuracao_ibscbs": "pelo_simples",
  "serie_dps": "00900"
}
```

| Campo | Valores |
|---|---|
| `simples_nacional` | `nao_optante`, `mei`, `me_epp` |
| `regime_apuracao_simples` | só para `me_epp`: `dentro_do_simples`, `iss_fora_do_simples`, `tudo_fora_do_simples` |
| `regime_especial` | `nenhum`, `ato_cooperado`, `estimativa`, `microempresa_municipal`, `notario_registrador`, `profissional_autonomo`, `sociedade_profissionais`, `outros` |
| `pis_cofins` | opcional: somente `{ "cst": "99", "tipo_retencao": "0" }`. Ausente ou `null` remove a configuração; para manter, reenvie em **todo PUT** |
| `tributos_aproximados.modo` | `percentual_simples` (somente ME/EPP), `percentual_por_esfera` (todos), `nao_informar` (somente MEI) |
| `aliquota_iss_simples` | opcional; só `me_epp` + `dentro_do_simples`; mínimo `"1.80"`. Usada apenas em notas com ISS retido |
| `regime_apuracao_ibscbs` | só para `me_epp`. Com `dentro_do_simples`: `pelo_simples` (padrão) ou `regime_regular`. Com `iss_fora_do_simples`: `cbs_simples_ibs_regular` (padrão) ou `regime_regular`. Com `tudo_fora_do_simples`: `regime_regular`. Ausente/`null` usa o padrão; ao trocar `regime_apuracao_simples`, o padrão volta a valer. Guardado agora; passa a ir na nota quando o governo ativar a próxima versão do leiaute (veja [Leiaute da NFS-e](leiaute-nt009.md)) |
| `serie_dps` | somente leitura; série usada na numeração das notas da empresa, atribuída pela notem a partir de 00900 (até 49999). Séries que a empresa já usava são mantidas |
| `imprimir_canhoto_danfse` | booleano opcional; padrão false; ausente no PUT preserva a preferência atual |

A notem recusa já ao gravar as combinações que o governo rejeitaria na emissão. Assim o erro aparece no cadastro, e não no momento de emitir. A recusa é `422 REGRA_DE_NEGOCIO`, com `detalhes` por campo (inclusive `tributos_aproximados.modo`) e a regra a seguir.

### Correspondência dos regimes na DPS

| Valor na API | Campo da DPS | Código | Significado |
|---|---|---|---|
| `nao_optante` | `opSimpNac` | `1` | Não optante do Simples Nacional |
| `mei` | `opSimpNac` | `2` | Optante MEI |
| `me_epp` | `opSimpNac` | `3` | Optante ME/EPP |
| `dentro_do_simples` | `regApTribSN` | `1` | Tributos federais e ISS pelo Simples Nacional |
| `iss_fora_do_simples` | `regApTribSN` | `2` | Tributos federais pelo Simples Nacional; ISS por fora |
| `tudo_fora_do_simples` | `regApTribSN` | `3` | Tributos federais e ISS por fora do Simples Nacional |
| `nenhum` | `regEspTrib` | `0` | Nenhum regime especial |

`regApTribSN` é obrigatório somente para `me_epp` e não é enviado para os outros dois casos. A escolha do regime não configura PIS/COFINS automaticamente.

### PIS/COFINS: escolha opcional por empresa

Cada empresa define com seu contador se deve informar o grupo. Nesta versão, a única combinação suportada é **CST `"99"` — Outras Operações** com **tipo de retenção `"0"` — PIS/COFINS/CSLL não retidos**. Os dois valores devem ser texto, e os dois campos devem estar presentes.

Com essa configuração, as novas DPS levam o seguinte grupo, entre `tribMun` e `totTrib`, sem base de cálculo, alíquotas ou valores:

```xml
<tribFed><piscofins><CST>99</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed>
```

- **Sem configuração:** a resposta de consulta traz `pis_cofins: null`; a DPS omite `tribFed`.
- **Outra combinação, configuração parcial ou valores numéricos:** `422 REGRA_DE_NEGOCIO`, com `campo: "pis_cofins"` e mensagem **"combinação de PIS/COFINS ainda não suportada"**.
- **Para manter:** reenvie o objeto em **cada PUT**, inclusive ao mudar outro campo.
- **Para remover:** envie `pis_cofins: null` ou omita o campo no PUT.
- **Notas anteriores:** não mudam. Cada nota guarda a configuração usada na sua criação; uma tentativa posterior do mesmo pedido não passa a usar a configuração editada da empresa.
- Este CST é de PIS/COFINS, não o CST de [IBS/CBS](ibs-cbs.md).

### Tributos aproximados: o que cada situação aceita
A nota informa uma estimativa dos tributos pagos pelo cliente. O governo aceita formas diferentes conforme a situação da empresa no Simples Nacional:

| Situação no Simples | Formas aceitas | Recusa do governo, se não seguir |
|---|---|---|
| `nao_optante` (fora do Simples) | `percentual_por_esfera` | E0713 — empresa fora do Simples não pode usar o percentual do Simples nem deixar de informar |
| `mei` | `percentual_por_esfera` ou `nao_informar` | E0710 — MEI não pode usar o percentual do Simples |
| `me_epp` | `percentual_simples` ou `percentual_por_esfera` | E0712 — ME/EPP não pode deixar de informar |

Por esfera exige os três percentuais: federal, estadual e municipal (zero é permitido). Percentual do Simples exige só `percentual_simples`. `nao_informar` não aceita percentuais. Campos ausentes valem `null`.

Configurações antigas fora dessas regras não são alteradas automaticamente, porque a notem não muda dados fiscais sem a sua decisão. Enquanto não forem corrigidas, o painel mostra um aviso, `/situacao` traz `configuracao_fiscal` pendente (**configuração fiscal incompleta**) e a emissão é recusada antes de gerar o número da nota.

### Regime especial: quando precisa ser `nenhum`
O governo não aceita regime especial nos casos abaixo. A notem confere ao gravar a configuração e ao cadastrar ou alterar serviços, e confere de novo na emissão, antes de gerar o número da nota:
- empresa MEI (E0174 — MEI não pode ter regime especial);
- ME/EPP com apuração dentro do Simples (E0175 — quem apura pelo Simples não pode ter regime especial);
- empresa com serviço ativo imune, de exportação ou sem incidência do ISS (E0172 — esses serviços não admitem regime especial).

Dados antigos fora da regra não são alterados: aparecem com aviso e deixam a configuração fiscal incompleta. Para corrigir, grave `regime_especial: "nenhum"`.

Com ISS retido pelo tomador (`retido_tomador`), o tomador precisa de CPF/CNPJ válido e endereço completo no Brasil; nome ou NIF estrangeiro não bastam. Veja [Emissão de notas](emissao.md#regras-gerais).

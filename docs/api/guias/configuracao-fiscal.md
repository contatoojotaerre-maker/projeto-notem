---
titulo: Configuração fiscal
ordem: 3
atualizado: 2026-11-17
descricao: Como informar a situação no Simples Nacional, os regimes e os tributos aproximados, e quais combinações o governo aceita.
---

# Configuração fiscal

`GET /empresas/{id}/configuracao-fiscal` · `PUT /empresas/{id}/configuracao-fiscal`

```json
{
  "simples_nacional": "me_epp",
  "regime_apuracao_simples": "dentro_do_simples",
  "regime_especial": "nenhum",
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
| `tributos_aproximados.modo` | `percentual_simples` (somente ME/EPP), `percentual_por_esfera` (todos), `nao_informar` (somente MEI) |
| `aliquota_iss_simples` | opcional; só `me_epp` + `dentro_do_simples`; mínimo `"1.80"`. Usada apenas em notas com ISS retido |
| `regime_apuracao_ibscbs` | só para `me_epp`. Com `dentro_do_simples`: `pelo_simples` (padrão) ou `regime_regular`. Com `iss_fora_do_simples`: `cbs_simples_ibs_regular` (padrão) ou `regime_regular`. Com `tudo_fora_do_simples`: `regime_regular`. Ausente/`null` usa o padrão; ao trocar `regime_apuracao_simples`, o padrão volta a valer. Guardado agora; passa a ir na nota quando o governo ativar a próxima versão do leiaute (veja [Leiaute da NFS-e](leiaute-nt009.md)) |
| `serie_dps` | somente leitura; série usada na numeração das notas da empresa, atribuída pela notem a partir de 00900 (até 49999). Séries que a empresa já usava são mantidas |
| `imprimir_canhoto_danfse` | booleano opcional; padrão false; ausente no PUT preserva a preferência atual |

A notem recusa já ao gravar as combinações que o governo rejeitaria na emissão. Assim o erro aparece no cadastro, e não no momento de emitir. A recusa é `422 REGRA_DE_NEGOCIO`, com `detalhes` por campo (inclusive `tributos_aproximados.modo`) e a regra a seguir.

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

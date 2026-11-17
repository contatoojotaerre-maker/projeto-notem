---
titulo: Configuração fiscal
ordem: 3
atualizado: 2026-11-17
descricao: Simples Nacional, regimes, tributos aproximados e as regras E0710, E0712, E0713, E0172, E0174 e E0175.
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
| `regime_apuracao_ibscbs` | só para `me_epp`. Com `dentro_do_simples`: `pelo_simples` (padrão) ou `regime_regular`. Com `iss_fora_do_simples`: `cbs_simples_ibs_regular` (padrão) ou `regime_regular`. Com `tudo_fora_do_simples`: `regime_regular`. Ausente/`null` usa o padrão; ao trocar `regime_apuracao_simples`, o padrão volta a valer. Guardado agora e enviado na nota a partir do próximo leiaute da NT 009 |
| `serie_dps` | somente leitura; novas atribuições automáticas desde 00900 até 49999; existentes preservadas |
| `imprimir_canhoto_danfse` | booleano opcional; padrão false; ausente no PUT preserva a preferência atual |

Erro de combinação inválida: `422 REGRA_DE_NEGOCIO` com `detalhes` por campo, incluindo `tributos_aproximados.modo` e a mensagem da regra.

### Matriz obrigatória — E0710, E0712 e E0713
| Situação | Modos permitidos | Proibição |
|---|---|---|
| `nao_optante` (1) | `percentual_por_esfera` | Sem `pTotTribSN` nem `indTotTrib` (E0713) |
| `mei` (2) | `percentual_por_esfera` ou `nao_informar` (`indTotTrib = 0`) | Sem `pTotTribSN` (E0710) |
| `me_epp` (3) | `percentual_simples` ou `percentual_por_esfera` | Sem `indTotTrib` (E0712) |

Por esfera exige federal, estadual e municipal (zero é permitido); percentual do Simples exige somente `percentual_simples`. Campos ausentes são tratados como `null`. Não informar não aceita percentuais.

Configurações antigas incompatíveis não são alteradas automaticamente. O painel mostra aviso da regra, `/situacao` retorna `configuracao_fiscal` pendente, com mensagem de **configuração fiscal incompleta**, e a emissão será recusada antes de reservar qualquer número.

### Regime especial — E0174, E0175 e E0172
`regime_especial` deve ser `nenhum` quando a empresa é `mei`, quando é `me_epp` com `dentro_do_simples` ou quando possui serviço ativo de `imunidade`, `exportacao` ou `nao_incidencia`. A configuração e o cadastro/edição de serviços validam a combinação; a emissão repete a validação antes da numeração. Dados antigos permanecem intactos, com aviso e configuração fiscal incompleta na situação. Para corrigir, escolha explicitamente `nenhum` e salve.
Na emissão com `retido_tomador`, o tomador precisa de CPF/CNPJ válido e endereço nacional completo (E0204/E0237); não basta o nome ou NIF estrangeiro.

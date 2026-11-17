---
titulo: Serviços e códigos
ordem: 4
atualizado: 2026-11-17
descricao: Modelos de serviço da empresa, código nacional, tributação do ISS, retenção e catálogos oficiais.
---

# Serviços e códigos

`GET /empresas/{id}/servicos` · `POST /empresas/{id}/servicos` · `GET`/`PATCH /empresas/{id}/servicos/{servico_id}`

```json
{
  "id": "UUID",
  "id_externo": "VISTORIA-PADRAO",
  "nome": "Vistoria veicular",
  "ativo": true,
  "codigo_servico": "140101",
  "descricao_servico": "Descrição oficial (somente leitura)",
  "codigo_municipal": null,
  "codigo_nbs": null,
  "descricao_padrao": "Vistoria veicular para transferência",
  "tributacao_iss": "tributavel",
  "tipo_imunidade": null,
  "retencao_iss": "nao_retido",
  "classificacao_ibscbs": {
    "codigo_classificacao": "000001",
    "cst": "000",
    "descricao": "Situações tributadas integralmente pelo IBS e CBS.",
    "indicador_operacao": "100501",
    "consumidor_final": false,
    "atividade_simples": "09",
    "situacao": "completa"
  },
  "indicador_operacao_ibscbs": "100501",
  "numero_beneficio_municipal": null
}
```
| Campo | Valores |
|---|---|
| `codigo_servico` | código nacional de 6 dígitos (ver `/catalogos/servicos`) |
| `tributacao_iss` | `tributavel`, `imunidade`, `exportacao`, `nao_incidencia` |
| `tipo_imunidade` | só com `imunidade`: `nao_informado`, `entes_federativos`, `templos`, `partidos_sindicatos_entidades`, `livros_jornais_papel`, `fonogramas_musicais` |
| `retencao_iss` | `nao_retido`, `retido_tomador`, `retido_intermediario` |

Serviços não são excluídos: use `ativo: false`.

A classificação IBS/CBS do serviço (`classificacao_ibscbs`) está em [IBS/CBS](ibs-cbs.md).

## Catálogos oficiais (somente leitura)
| Rota | Filtro `busca` (2+ caracteres, sem acento) |
|---|---|
| `GET /catalogos/municipios` | nome ou código IBGE |
| `GET /catalogos/servicos` | descrição ou código nacional |
| `GET /catalogos/nbs` | descrição ou código NBS |
| `GET /catalogos/classificacoes-tributarias` | descrição ou código cClassTrib (73 aceitas na NFS-e; `suportada` e `motivo_nao_suportada`) |
| `GET /catalogos/indicadores-operacao` | código ou local; `incluir_inativos=true` inclui os 5 retirados |
| `GET /catalogos/sugestao-classificacao?codigo_servico=` | sugestão do Anexo VIII (não é lista) |

Respostas em lista paginada.

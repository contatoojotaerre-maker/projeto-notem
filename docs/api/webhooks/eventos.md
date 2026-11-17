---
titulo: Eventos
ordem: 2
atualizado: 2026-11-17
descricao: Lista de eventos, assinatura por grupo com curingas e o conteúdo de cada evento, com exemplos completos.
---

# Eventos

Nomes de eventos em português, no formato `recurso.acontecimento`.

| Tipo | Quando |
|---|---|
| `webhook.teste` | Envio de teste pelo painel |
| `nota.autorizada` | Nota autorizada pelo governo (inclusive após "em verificação") |
| `nota.rejeitada` | Emissão rejeitada pelo governo |
| `nota.cancelada` | Cancelamento concluído |
| `nota.cancelamento_em_analise` | Pedido de análise fiscal do cancelamento registrado; a prefeitura decide |
| `nota.cancelamento_indeferido` | Prefeitura indeferiu o cancelamento |
| `nota.substituida` | Nota original substituída: a substituta foi autorizada |
| `nota.cancelada_prefeitura` | Prefeitura cancelou a nota por ofício |
| `nota.bloqueada_prefeitura` | Prefeitura bloqueou ações sobre a nota |
| `nota.desbloqueada_prefeitura` | Prefeitura retirou o bloqueio da nota |
| `nota.manifestacao` | Tomador (ou outro ator) confirmou ou rejeitou a nota |
| `empresa.situacao_alterada` | Empresa ficou pronta ou deixou de estar pronta para emitir |
| `certificado.vencendo` | Certificado vence em 30, 15, 7 e 1 dia |
| `certificado.vencido` | Certificado venceu |
| `municipio.disponivel` | Município passou a ser atendido |

Os campos de `dados` de cada evento estão descritos abaixo e na página do recurso correspondente.

Os avisos `nota.bloqueada_prefeitura` e `nota.desbloqueada_prefeitura` são enviados para notas emitidas pela notem quando a prefeitura registra ou retira o bloqueio por ofício. `dados` é o objeto `nota` completo; durante o bloqueio, `restricoes` contém um item com `"tipo": "bloqueio_prefeitura"`, que deixa de aparecer após o desbloqueio. Como os demais avisos de nota, chegam quando o evento é conhecido pela notem: pela sincronização feita no painel, por "Atualizar com o governo" ou pela verificação diária das notas com cancelamento pendente.

## Dados dos eventos de empresa e certificado
`empresa.situacao_alterada` — enviado uma única vez a cada mudança de `pronta_para_emitir` em um ambiente (após alteração pela API ou pelo painel, verificação do município ou vencimento do certificado):
```json
{
  "id": "evt_33333333333333333333333333333333",
  "tipo": "empresa.situacao_alterada",
  "criado_em": "2026-11-12T09:40:12-03:00",
  "ambiente": "producao",
  "organizacao_id": "00000000-0000-4000-8000-000000000401",
  "integracao_id": "00000000-0000-4000-8000-000000000501",
  "dados": {
    "empresa_id": "00000000-0000-4000-8000-000000000201",
    "id_externo": "ECV-1029",
    "cnpj": "11222333000181",
    "ambiente": "producao",
    "pronta_para_emitir": true,
    "pendencias": []
  }
}
```
`pendencias`: itens de `GET /empresas/{id}/situacao` com `ok` diferente de `true` (`empresa_ativa`, `certificado`, `configuracao_fiscal`, `servico_ativo`, `municipio`).

`certificado.vencendo` (30, 15, 7 e 1 dia antes) e `certificado.vencido` — verificados uma vez por dia; cada marco é avisado uma única vez por certificado, nos dois ambientes:
```json
{
  "id": "evt_44444444444444444444444444444444",
  "tipo": "certificado.vencendo",
  "criado_em": "2027-01-03T06:00:00-03:00",
  "ambiente": "producao",
  "organizacao_id": "00000000-0000-4000-8000-000000000401",
  "integracao_id": "00000000-0000-4000-8000-000000000501",
  "dados": {
    "empresa_id": "00000000-0000-4000-8000-000000000201",
    "id_externo": "ECV-1029",
    "cnpj": "11222333000181",
    "valido_ate": "2027-01-10T00:00:00-03:00",
    "dias_para_vencer": 7
  }
}
```
`certificado.vencido` usa o mesmo envelope e os mesmos campos em `dados`, com `"tipo": "certificado.vencido"` e `"dias_para_vencer": 0`.
Esses eventos respeitam o filtro por empresa do endereço. Pela API, a primeira tentativa é imediata; alterações feitas no painel e a rotina diária são entregues pelo processamento automático (cerca de 1 minuto). Novos tipos podem ser adicionados sem aviso; ignore tipos que você não conhece.

## Assinatura por grupo

## Eventos de notas
Todos os eventos `nota.*` trazem em `dados` o **objeto `nota` completo** (veja [Ciclo de vida da nota](../guias/ciclo-de-vida.md)), sem o conteúdo do XML/PDF (use os links). `nota.autorizada` e `nota.rejeitada` enviam esse objeto sem conteúdo XML/PDF, certificado ou senha. Os eventos respeitam organização, ambiente, assinatura e filtro por empresa. Confirme o estado por `GET /notas/{id}`.

Um endereço pode assinar eventos individuais (tipo exato) ou grupos inteiros por curinga. Assinar um grupo inclui automaticamente os eventos que forem adicionados a ele no futuro.

| Grupo no painel | Curingas | Eventos atuais |
|---|---|---|
| Notas de serviço (NFS-e) | `nota.*` | `nota.autorizada`, `nota.rejeitada`, `nota.cancelada`, `nota.cancelamento_em_analise`, `nota.cancelamento_indeferido`, `nota.substituida`, `nota.cancelada_prefeitura`, `nota.bloqueada_prefeitura`, `nota.desbloqueada_prefeitura`, `nota.manifestacao` |
| Empresas e certificados | `empresa.*`, `certificado.*` | `empresa.situacao_alterada`, `certificado.vencendo`, `certificado.vencido` |
| Municípios | `municipio.*` | `municipio.disponivel` |

- **Correspondência:** um evento é entregue quando o endereço assina o tipo exato **ou** o curinga do seu prefixo (por exemplo, `nota.rejeitada` corresponde a `nota.rejeitada` ou `nota.*`).
- `webhook.teste` é sempre incluído e sempre entregue, independentemente dos eventos e do filtro de empresa.
- Só são aceitos tipos conhecidos e os curingas acima; outros valores são recusados.
- Escolher eventos individualmente ("Personalizar eventos") não inclui eventos futuros do grupo.
- Endereços já cadastrados com eventos individuais continuam funcionando sem alteração.
- O envelope, os cabeçalhos, a assinatura e o cronograma de tentativas não mudam.

Os dados das notas trazem o objeto `ibs_cbs` (valores do IBS/CBS calculados pelo governo e lidos da nota autorizada; `null` quando a nota não tem o grupo), no mesmo formato de `GET /notas/{id}` (veja [IBS/CBS](../guias/ibs-cbs.md)).

## Exemplos completos

### Exemplo completo: `nota.autorizada`
Valores fictícios para demonstrar o formato; mensagens governamentais são ilustrativas.
```json
{
  "id": "evt_11111111111111111111111111111111",
  "tipo": "nota.autorizada",
  "criado_em": "2026-11-12T10:15:05-03:00",
  "ambiente": "producao",
  "organizacao_id": "00000000-0000-4000-8000-000000000401",
  "integracao_id": "00000000-0000-4000-8000-000000000501",
  "dados": {
    "id": "00000000-0000-4000-8000-000000000101",
    "id_externo": "OS-55821",
    "empresa_id": "00000000-0000-4000-8000-000000000201",
    "ambiente": "producao",
    "situacao": "autorizada",
    "restricoes": [],
    "manifestacao": null,
    "numero": "123",
    "chave_acesso": "42054072211222333000181000000000012326110000000001",
    "serie_dps": "00900",
    "numero_dps": "57",
    "competencia": "2026-11-12",
    "emitida_em": "2026-11-12T10:15:03-03:00",
    "autorizada_em": "2026-11-12T10:15:05-03:00",
    "tomador": {
      "tipo": "pj",
      "documento": "99888777000100",
      "nome": "Cliente Exemplo LTDA"
    },
    "servico": {
      "servico_id": "00000000-0000-4000-8000-000000000301",
      "codigo_servico": "140101",
      "descricao": "Vistoria veicular - placa ABC1D23"
    },
    "valores": {
      "servico": "150.00",
      "desconto_incondicionado": "0.00",
      "desconto_condicionado": "0.00",
      "base_calculo": "150.00",
      "aliquota_iss": null,
      "valor_iss": null,
      "iss_retido": false,
      "valor_liquido": "150.00"
    },
    "local_prestacao": {
      "codigo_municipio": "4205407",
      "municipio": "Florianópolis",
      "uf": "SC"
    },
    "ibs_cbs": null,
    "erros_governo": [],
    "substitui_nota_id": null,
    "substituida_por_nota_id": null,
    "operacao_pendente": null,
    "cancelamento": null,
    "links": {
      "xml": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/xml",
      "pdf": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/pdf",
      "consulta_publica": "https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=42054072211222333000181000000000012326110000000001"
    },
    "criada_em": "2026-11-12T10:15:03-03:00",
    "atualizada_em": "2026-11-12T10:15:05-03:00"
  }
}
```

### Exemplo completo: `nota.rejeitada`
Valores fictícios para demonstrar o formato; mensagens governamentais são ilustrativas.
```json
{
  "id": "evt_22222222222222222222222222222222",
  "tipo": "nota.rejeitada",
  "criado_em": "2026-11-12T10:15:05-03:00",
  "ambiente": "producao",
  "organizacao_id": "00000000-0000-4000-8000-000000000401",
  "integracao_id": "00000000-0000-4000-8000-000000000501",
  "dados": {
    "id": "00000000-0000-4000-8000-000000000101",
    "id_externo": "OS-55821",
    "empresa_id": "00000000-0000-4000-8000-000000000201",
    "ambiente": "producao",
    "situacao": "rejeitada",
    "restricoes": [],
    "manifestacao": null,
    "numero": null,
    "chave_acesso": null,
    "serie_dps": "00900",
    "numero_dps": "57",
    "competencia": "2026-11-12",
    "emitida_em": "2026-11-12T10:15:03-03:00",
    "autorizada_em": null,
    "tomador": {
      "tipo": "pj",
      "documento": "99888777000100",
      "nome": "Cliente Exemplo LTDA"
    },
    "servico": {
      "servico_id": "00000000-0000-4000-8000-000000000301",
      "codigo_servico": "140101",
      "descricao": "Vistoria veicular - placa ABC1D23"
    },
    "valores": {
      "servico": "150.00",
      "desconto_incondicionado": "0.00",
      "desconto_condicionado": "0.00",
      "base_calculo": null,
      "aliquota_iss": null,
      "valor_iss": null,
      "iss_retido": false,
      "valor_liquido": null
    },
    "local_prestacao": {
      "codigo_municipio": "4205407",
      "municipio": "Florianópolis",
      "uf": "SC"
    },
    "ibs_cbs": null,
    "erros_governo": [
      {
        "campo": "tomador.endereco.cep",
        "mensagem": "O CEP do tomador não existe ou não pertence ao município informado. Confira o CEP e o código do município.",
        "codigo_governo": "E0240",
        "mensagem_governo": "CEP informado não pertence ao município do tomador.",
        "complemento": null,
        "nota_id": "00000000-0000-4000-8000-000000000101"
      }
    ],
    "substitui_nota_id": null,
    "substituida_por_nota_id": null,
    "operacao_pendente": null,
    "cancelamento": null,
    "links": {
      "xml": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/xml",
      "pdf": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/pdf",
      "consulta_publica": null
    },
    "criada_em": "2026-11-12T10:15:03-03:00",
    "atualizada_em": "2026-11-12T10:15:05-03:00"
  }
}
```

### Exemplo completo: `nota.cancelada`
Enviado quando o governo registra o cancelamento, inclusive quando a notem confirma um cancelamento feito fora dela (`cancelamento.registrado_fora_da_notem: true`). Valores fictícios.
```json
{
  "id": "evt_33333333333333333333333333333333",
  "tipo": "nota.cancelada",
  "criado_em": "2026-11-13T09:20:41-03:00",
  "ambiente": "producao",
  "organizacao_id": "00000000-0000-4000-8000-000000000401",
  "integracao_id": "00000000-0000-4000-8000-000000000501",
  "dados": {
    "id": "00000000-0000-4000-8000-000000000101",
    "id_externo": "OS-55821",
    "empresa_id": "00000000-0000-4000-8000-000000000201",
    "ambiente": "producao",
    "situacao": "cancelada",
    "restricoes": [],
    "manifestacao": null,
    "numero": "123",
    "chave_acesso": "42054072211222333000181000000000012326110000000001",
    "serie_dps": "00900",
    "numero_dps": "57",
    "competencia": "2026-11-12",
    "emitida_em": "2026-11-12T10:15:03-03:00",
    "autorizada_em": "2026-11-12T10:15:05-03:00",
    "tomador": {
      "tipo": "pj",
      "documento": "99888777000100",
      "nome": "Cliente Exemplo LTDA"
    },
    "servico": {
      "servico_id": "00000000-0000-4000-8000-000000000301",
      "codigo_servico": "140101",
      "descricao": "Vistoria veicular - placa ABC1D23"
    },
    "valores": {
      "servico": "150.00",
      "desconto_incondicionado": "0.00",
      "desconto_condicionado": "0.00",
      "base_calculo": "150.00",
      "aliquota_iss": null,
      "valor_iss": null,
      "iss_retido": false,
      "valor_liquido": "150.00"
    },
    "local_prestacao": {
      "codigo_municipio": "4205407",
      "municipio": "Florianópolis",
      "uf": "SC"
    },
    "ibs_cbs": null,
    "erros_governo": [],
    "substitui_nota_id": null,
    "substituida_por_nota_id": null,
    "operacao_pendente": null,
    "cancelamento": {
      "tipo": "cancelamento",
      "motivo": "erro_emissao",
      "justificativa": "Valor do serviço informado incorretamente.",
      "solicitado_em": "2026-11-13T09:20:38-03:00",
      "registrado_em": "2026-11-13T09:20:40-03:00",
      "situacao": "cancelado",
      "pode_solicitar_analise": false,
      "registrado_fora_da_notem": false,
      "ibs_cbs": null,
      "erros_governo": []
    },
    "links": {
      "xml": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/xml",
      "pdf": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/pdf",
      "consulta_publica": "https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=42054072211222333000181000000000012326110000000001"
    },
    "criada_em": "2026-11-12T10:15:03-03:00",
    "atualizada_em": "2026-11-13T09:20:41-03:00"
  }
}
```

### Exemplo completo: `nota.cancelamento_em_analise`
Enviado quando o pedido de análise fiscal do cancelamento é registrado. Valores fictícios.
```json
{
  "id": "evt_44444444444444444444444444444444",
  "tipo": "nota.cancelamento_em_analise",
  "criado_em": "2026-11-20T15:02:11-03:00",
  "ambiente": "producao",
  "organizacao_id": "00000000-0000-4000-8000-000000000401",
  "integracao_id": "00000000-0000-4000-8000-000000000501",
  "dados": {
    "id": "00000000-0000-4000-8000-000000000101",
    "id_externo": "OS-55821",
    "empresa_id": "00000000-0000-4000-8000-000000000201",
    "ambiente": "producao",
    "situacao": "cancelamento_em_analise",
    "restricoes": [],
    "manifestacao": null,
    "numero": "123",
    "chave_acesso": "42054072211222333000181000000000012326110000000001",
    "serie_dps": "00900",
    "numero_dps": "57",
    "competencia": "2026-11-12",
    "emitida_em": "2026-11-12T10:15:03-03:00",
    "autorizada_em": "2026-11-12T10:15:05-03:00",
    "tomador": {
      "tipo": "pj",
      "documento": "99888777000100",
      "nome": "Cliente Exemplo LTDA"
    },
    "servico": {
      "servico_id": "00000000-0000-4000-8000-000000000301",
      "codigo_servico": "140101",
      "descricao": "Vistoria veicular - placa ABC1D23"
    },
    "valores": {
      "servico": "150.00",
      "desconto_incondicionado": "0.00",
      "desconto_condicionado": "0.00",
      "base_calculo": "150.00",
      "aliquota_iss": null,
      "valor_iss": null,
      "iss_retido": false,
      "valor_liquido": "150.00"
    },
    "local_prestacao": {
      "codigo_municipio": "4205407",
      "municipio": "Florianópolis",
      "uf": "SC"
    },
    "ibs_cbs": null,
    "erros_governo": [],
    "substitui_nota_id": null,
    "substituida_por_nota_id": null,
    "operacao_pendente": null,
    "cancelamento": {
      "tipo": "analise_cancelamento",
      "motivo": "servico_nao_prestado",
      "justificativa": "Serviço não prestado; prazo de cancelamento expirado.",
      "solicitado_em": "2026-11-20T15:02:08-03:00",
      "registrado_em": "2026-11-20T15:02:10-03:00",
      "situacao": "em_analise",
      "pode_solicitar_analise": false,
      "registrado_fora_da_notem": false,
      "ibs_cbs": null,
      "erros_governo": []
    },
    "links": {
      "xml": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/xml",
      "pdf": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/pdf",
      "consulta_publica": "https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=42054072211222333000181000000000012326110000000001"
    },
    "criada_em": "2026-11-12T10:15:03-03:00",
    "atualizada_em": "2026-11-20T15:02:11-03:00"
  }
}
```

### Exemplo completo: `nota.substituida`
Enviado para a nota **original** quando a substituta é autorizada (a substituta gera `nota.autorizada`, com `substitui_nota_id`). Valores fictícios.
```json
{
  "id": "evt_55555555555555555555555555555555",
  "tipo": "nota.substituida",
  "criado_em": "2026-11-14T11:00:07-03:00",
  "ambiente": "producao",
  "organizacao_id": "00000000-0000-4000-8000-000000000401",
  "integracao_id": "00000000-0000-4000-8000-000000000501",
  "dados": {
    "id": "00000000-0000-4000-8000-000000000101",
    "id_externo": "OS-55821",
    "empresa_id": "00000000-0000-4000-8000-000000000201",
    "ambiente": "producao",
    "situacao": "substituida",
    "restricoes": [],
    "manifestacao": null,
    "numero": "123",
    "chave_acesso": "42054072211222333000181000000000012326110000000001",
    "serie_dps": "00900",
    "numero_dps": "57",
    "competencia": "2026-11-12",
    "emitida_em": "2026-11-12T10:15:03-03:00",
    "autorizada_em": "2026-11-12T10:15:05-03:00",
    "tomador": {
      "tipo": "pj",
      "documento": "99888777000100",
      "nome": "Cliente Exemplo LTDA"
    },
    "servico": {
      "servico_id": "00000000-0000-4000-8000-000000000301",
      "codigo_servico": "140101",
      "descricao": "Vistoria veicular - placa ABC1D23"
    },
    "valores": {
      "servico": "150.00",
      "desconto_incondicionado": "0.00",
      "desconto_condicionado": "0.00",
      "base_calculo": "150.00",
      "aliquota_iss": null,
      "valor_iss": null,
      "iss_retido": false,
      "valor_liquido": "150.00"
    },
    "local_prestacao": {
      "codigo_municipio": "4205407",
      "municipio": "Florianópolis",
      "uf": "SC"
    },
    "ibs_cbs": null,
    "erros_governo": [],
    "substitui_nota_id": null,
    "substituida_por_nota_id": "00000000-0000-4000-8000-000000000102",
    "operacao_pendente": null,
    "cancelamento": null,
    "links": {
      "xml": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/xml",
      "pdf": "https://app.notemfiscal.com.br/api/v1/notas/00000000-0000-4000-8000-000000000101/pdf",
      "consulta_publica": "https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=42054072211222333000181000000000012326110000000001"
    },
    "criada_em": "2026-11-12T10:15:03-03:00",
    "atualizada_em": "2026-11-14T11:00:07-03:00"
  }
}
```

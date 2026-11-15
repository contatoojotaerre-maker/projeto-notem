# API da notem — Empresas

Rotas para o sistema parceiro cadastrar e preparar as empresas emitentes, sem que o cliente final acesse a notem. Leia antes `convencoes.md`.

## Regras gerais
- Uma integração opera **todas as empresas da sua organização** (não há seleção de empresas por integração).
- **Empresas, configuração fiscal, certificado e serviços são compartilhados entre os ambientes**: são os mesmos dados com a chave de homologação ou de produção. O que muda por ambiente são as **notas**, a **numeração** e a **verificação do município**. Atenção: alterar uma empresa com a chave de homologação altera também os dados usados em produção.
- Valores fiscais são enviados em texto legível (ex.: `"me_epp"`); a notem converte para os códigos oficiais.
- `Idempotency-Key` é aceito em `POST`, `PATCH`, `PUT` e `DELETE` (24 h por integração e ambiente; ver `convencoes.md` seção 7) e recomendado em `POST /empresas`.
- Alterações feitas pela API aparecem no painel como "Alterado via API — integração X".

## 1. Empresa

### Objeto `empresa`
```json
{
  "id": "UUID",
  "id_externo": "ECV-1029",
  "cnpj": "11222333000181",
  "razao_social": "Vistoria Exemplo LTDA",
  "nome_fantasia": "Vistoria Exemplo",
  "inscricao_municipal": "12345",
  "email": "contato@exemplo.com.br",
  "telefone": "48999990000",
  "endereco": {
    "cep": "88980000",
    "logradouro": "Rua Exemplo",
    "numero": "100",
    "complemento": null,
    "bairro": "Centro",
    "codigo_municipio": "4212254",
    "municipio": "Passo de Torres",
    "uf": "SC"
  },
  "ativa": true,
  "criada_em": "2026-11-05T10:00:00-03:00",
  "atualizada_em": "2026-11-05T10:00:00-03:00"
}
```
- `municipio` e `uf` são preenchidos pela notem a partir de `codigo_municipio` (não enviar).
- `cnpj`: 14 posições, numérico (`11222333000181`) ou alfanumérico (`12ABC34501DE35`). Máscara e minúsculas são aceitas na entrada (`12.abc.345/01de-35`); a resposta traz sempre o valor normalizado. O filtro `?cnpj=` aceita o mesmo formato.
- `cnpj` é imutável depois que a empresa recebe certificado ou série de numeração (`409 CNPJ_IMUTAVEL`).
- `id_externo` é único por organização (`409 ID_EXTERNO_DUPLICADO`). Pode ser definido ou trocado apenas pela API.

### Rotas
| Método e rota | Descrição | Respostas |
|---|---|---|
| `POST /empresas` | Cadastra | `201` empresa · `409 EMPRESA_DUPLICADA` (mesmo CNPJ na organização; `detalhes` traz o `id` existente) · `409 ID_EXTERNO_DUPLICADO` |
| `GET /empresas` | Lista. Filtros: `cnpj`, `id_externo`, `ativa`, `busca` (nome) | `200` lista paginada |
| `GET /empresas/{id}` | Consulta | `200` · `404` |
| `PATCH /empresas/{id}` | Altera campos enviados. `ativa: false` desativa; `ativa: true` reativa | `200` · `409 CNPJ_IMUTAVEL` |
| `DELETE /empresas/{id}` | Exclui definitivamente | `204` · `409 EMPRESA_POSSUI_HISTORICO` |

**Desativar × excluir**
- **Desativar** (`PATCH ativa: false`): bloqueia novas emissões, mantém todo o histórico; pode ser reativada.
- **Excluir** (`DELETE`): só é permitido se a empresa **nunca reservou número de DPS e não tem notas** em nenhum ambiente. Remove a empresa, seus serviços e o certificado guardado. Caso contrário: `409 EMPRESA_POSSUI_HISTORICO` — use desativar. (Notas fiscais precisam ser guardadas, e a numeração já usada no governo não pode ser reaproveitada.)

## 2. Configuração fiscal

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

## 3. Certificado digital (A1)

`POST /empresas/{id}/certificado` — envia ou substitui:
```json
{ "arquivo_base64": "MIIK...", "senha": "••••" }
```
- Arquivo `.pfx`/`.p12` de até 100 KB, em base64. A senha e o arquivo **nunca** são devolvidos nem registrados.
- Resposta `200`: metadados (abaixo). Substituir mantém o anterior válido até o novo ser aceito.

`GET /empresas/{id}/certificado` — metadados do certificado ativo (`404` se não houver):
```json
{
  "titular": "VISTORIA EXEMPLO LTDA:11222333000181",
  "cnpj": "11222333000181",
  "emissor": "AC EXEMPLO",
  "numero_serie": "3A9F...",
  "valido_de": "2026-01-10T00:00:00-03:00",
  "valido_ate": "2027-01-10T00:00:00-03:00",
  "situacao": "valido",
  "dias_para_vencer": 66
}
```
`situacao`: `valido`, `vencendo` (30 dias ou menos), `vencido`.

| Erro (422) | Quando |
|---|---|
| `CERTIFICADO_SENHA_OU_ARQUIVO_INVALIDO` | senha incorreta ou arquivo inválido |
| `CERTIFICADO_SEM_CHAVE_PRIVADA` | arquivo sem chave privada (não é A1) |
| `CERTIFICADO_VENCIDO` | validade encerrada |
| `CERTIFICADO_AINDA_NAO_VALIDO` | validade ainda não começou |
| `CERTIFICADO_CNPJ_NAO_ENCONTRADO` | não é um e-CNPJ ICP-Brasil reconhecível |
| `CERTIFICADO_CNPJ_DIVERGENTE` | CNPJ do certificado diferente do da empresa |

## 4. Serviços

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

### IBS/CBS do serviço (`classificacao_ibscbs`)

A notem envia ao governo **somente a classificação**; alíquotas, base e valores do IBS/CBS são calculados pelo governo e devolvidos na nota autorizada (objeto `ibs_cbs`, ver `notas.md`).

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

Serviços não são excluídos: use `ativo: false`.

## 5. Situação da empresa (pronta para emitir?)

`GET /empresas/{id}/situacao` — calculada para o **ambiente da chave**:
```json
{
  "ambiente": "homologacao",
  "pronta_para_emitir": false,
  "itens": [
    { "item": "empresa_ativa", "ok": true, "mensagem": "Empresa ativa." },
    { "item": "certificado", "ok": true, "mensagem": "Certificado válido até 10/01/2027." },
    { "item": "configuracao_fiscal", "ok": true, "mensagem": "Configuração fiscal completa." },
    { "item": "servico_ativo", "ok": true, "mensagem": "1 serviço ativo." },
    { "item": "municipio", "ok": false, "verificado_em": "2026-11-05T10:00:00-03:00",
      "mensagem": "Homologação indisponível neste município." }
  ]
}
```
- `ok: null` no item `municipio` quando ainda não foi verificado.
- `avisos` lista alertas que **não impedem** a emissão. Antes da data de obrigatoriedade do IBS/CBS do ambiente (padrão 01/01/2027), serviços ativos sem classificação completa geram `{ "item": "classificacao_ibscbs", "mensagem": "Classificação IBS/CBS pendente — obrigatória a partir de 01/01/2027." }`; a partir da data, `classificacao_ibscbs` passa a ser um item de `itens` e bloqueia a emissão enquanto pendente.
- `POST /empresas/{id}/situacao/verificar-municipio` consulta o governo (convênio) e devolve a situação atualizada. Limite: 1 vez por minuto por empresa e ambiente (`429 LIMITE_EXCEDIDO` com `Retry-After`). Exige certificado válido.

## 6. Catálogos oficiais (somente leitura)
| Rota | Filtro `busca` (2+ caracteres, sem acento) |
|---|---|
| `GET /catalogos/municipios` | nome ou código IBGE |
| `GET /catalogos/servicos` | descrição ou código nacional |
| `GET /catalogos/nbs` | descrição ou código NBS |
| `GET /catalogos/classificacoes-tributarias` | descrição ou código cClassTrib (73 aceitas na NFS-e; `suportada` e `motivo_nao_suportada`) |
| `GET /catalogos/indicadores-operacao` | código ou local; `incluir_inativos=true` inclui os 5 retirados |
| `GET /catalogos/sugestao-classificacao?codigo_servico=` | sugestão do Anexo VIII (não é lista) |

Respostas em lista paginada.

## 7. Webhook `empresa.situacao_alterada`
Enviado quando `pronta_para_emitir` muda em algum ambiente.
```json
"dados": {
  "empresa_id": "UUID",
  "id_externo": "ECV-1029",
  "cnpj": "11222333000181",
  "ambiente": "producao",
  "pronta_para_emitir": true,
  "pendencias": []
}
```
`pendencias`: lista dos `item` com `ok` diferente de `true`.

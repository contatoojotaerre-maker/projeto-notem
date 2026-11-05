# API da notem — Empresas (fase 3B)

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
- **Excluir** (`DELETE`): só é permitido se a empresa **nunca reservou número de DPS e não tem notas** em nenhum ambiente (enquanto a emissão não existe, é verificada a numeração DPS). Remove a empresa, seus serviços e o certificado guardado. Caso contrário: `409 EMPRESA_POSSUI_HISTORICO` — use desativar. (Notas fiscais precisam ser guardadas, e a numeração já usada no governo não pode ser reaproveitada.)

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
  "serie_dps": "00001"
}
```

| Campo | Valores |
|---|---|
| `simples_nacional` | `nao_optante`, `mei`, `me_epp` |
| `regime_apuracao_simples` | só para `me_epp`: `dentro_do_simples`, `iss_fora_do_simples`, `tudo_fora_do_simples` |
| `regime_especial` | `nenhum`, `ato_cooperado`, `estimativa`, `microempresa_municipal`, `notario_registrador`, `profissional_autonomo`, `sociedade_profissionais`, `outros` |
| `tributos_aproximados.modo` | `percentual_simples` (só optantes), `percentual_por_esfera`, `nao_informar` (só optantes — regra oficial E0713) |
| `aliquota_iss_simples` | opcional; só `me_epp` + `dentro_do_simples`; mínimo `"1.80"`. Usada apenas em notas com ISS retido |
| `serie_dps` | somente leitura; atribuída automaticamente (00001 a 49999) |

Erro de combinação inválida: `422 REGRA_DE_NEGOCIO` com `detalhes` por campo.

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
  "indicador_operacao_ibscbs": null,
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
- `POST /empresas/{id}/situacao/verificar-municipio` consulta o governo (convênio) e devolve a situação atualizada. Limite: 1 vez por minuto por empresa e ambiente (`429 LIMITE_EXCEDIDO` com `Retry-After`). Exige certificado válido.

## 6. Catálogos oficiais (somente leitura)
| Rota | Filtro `busca` (2+ caracteres, sem acento) |
|---|---|
| `GET /catalogos/municipios` | nome ou código IBGE |
| `GET /catalogos/servicos` | descrição ou código nacional |
| `GET /catalogos/nbs` | descrição ou código NBS |

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

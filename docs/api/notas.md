# API da notem — Notas (emissão e consulta)

Leia antes `convencoes.md` e `empresas.md`. Cancelamento e substituição terão documento próprio na fase seguinte.

## Regras gerais
- A nota é emitida no **ambiente da chave**: homologação (sem validade fiscal) ou produção.
- Antes de enviar ao governo, a notem confere se a empresa está **pronta para emitir** (`/empresas/{id}/situacao`). Se não estiver: `422 EMPRESA_NAO_PRONTA`, com as pendências em `detalhes`. Nada é enviado nem numerado.
- `Idempotency-Key` é **obrigatório** em `POST /notas`. Reenviar a mesma chave (ex.: após queda de conexão) **nunca** gera uma segunda nota.
- A numeração (série e número da DPS) é feita pela notem. Um número usado nunca é reaproveitado, mesmo se a nota for rejeitada.

## 1. Emitir nota — `POST /notas`

### Pedido
```json
{
  "empresa_id": "UUID",
  "id_externo": "OS-55821",
  "servico_id": "UUID",
  "competencia": "2026-11-12",
  "descricao": "Vistoria veicular — placa ABC1D23",
  "tomador": {
    "tipo": "pj",
    "documento": "99888777000166",
    "nome": "Cliente Exemplo LTDA",
    "email": "financeiro@cliente.com.br",
    "telefone": "48999990000",
    "inscricao_municipal": null,
    "endereco": {
      "cep": "88980000", "logradouro": "Rua A", "numero": "10", "complemento": null,
      "bairro": "Centro", "codigo_municipio": "4212254"
    }
  },
  "valores": {
    "servico": "150.00",
    "desconto_incondicionado": "0.00",
    "desconto_condicionado": "0.00"
  },
  "retencao_iss": null,
  "aliquota_iss_simples": null,
  "local_prestacao": null,
  "informacoes_complementares": null
}
```

| Campo | Regra |
|---|---|
| `empresa_id` ou `empresa_id_externo` | obrigatório (um dos dois) |
| `id_externo` | opcional; código da nota no sistema do parceiro, único por organização |
| `servico_id` ou `servico_id_externo` | obrigatório; serviço ativo da empresa. Define código do serviço, tributação e retenção padrão |
| `competencia` | opcional; padrão = data de hoje. Não pode ser futura |
| `descricao` | opcional; padrão = descrição padrão do serviço. Até 2.000 caracteres |
| `tomador` **ou** `tomador_id` **ou** `tomador_id_externo` | opcional, mas recomendado. Alguns municípios e operações (ex.: cancelamento) exigem tomador identificado |
| `valores.servico` | obrigatório, maior que zero |
| `valores.desconto_*` | opcionais; padrão `"0.00"` |
| `retencao_iss` | opcional; substitui a retenção padrão do serviço (`nao_retido`, `retido_tomador`, `retido_intermediario`) |
| `aliquota_iss_simples` | opcional; substitui a da configuração fiscal. Usada **somente** quando há retenção e a empresa é ME/EPP no Simples |
| `local_prestacao.codigo_municipio` | opcional; padrão = município da empresa |
| `informacoes_complementares` | opcional; até 2.000 caracteres |

A **alíquota do ISS** não é enviada pelo parceiro: o governo aplica a do município (parâmetros oficiais), exceto nos casos previstos para o Simples Nacional.

### Tomador
| Campo | Regra |
|---|---|
| `tipo` | `pj`, `pf` ou `estrangeiro` |
| `documento` | CNPJ (14) para `pj`; CPF (11) para `pf`; ausente para `estrangeiro` |
| `nif` | estrangeiro: número de identificação fiscal do país (ou `null` com `motivo_sem_nif`) |
| `nome` | obrigatório |
| `email`, `telefone`, `inscricao_municipal` | opcionais |
| `endereco` | nacional: `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `codigo_municipio`. Estrangeiro: `pais` (ISO 2), `cidade`, `endereco_livre`, `codigo_postal` |

### Resposta
A notem envia ao governo e **aguarda o resultado por até cerca de 20 segundos**:

| Resultado | Status | Corpo |
|---|---|---|
| Autorizada | `201` | objeto `nota` com `situacao: "autorizada"` |
| Governo demorou ou a conexão caiu | `202` | objeto `nota` com `situacao: "em_verificacao"`. A notem confirma sozinha e avisa por webhook (`nota.autorizada` ou `nota.rejeitada`). Não reenvie com outra `Idempotency-Key` |
| Rejeitada pelo governo | `422 REJEITADO_GOVERNO` | erro padrão; `detalhes` traz cada motivo do governo (`codigo_governo`, mensagem original e explicação em português) e `nota_id` da nota registrada como `rejeitada` |
| Validação antes do envio | `422 REGRA_DE_NEGOCIO` / `EMPRESA_NAO_PRONTA` / `400` | nenhuma nota criada, nenhum número usado |
| Governo fora do ar antes do envio | `503 GOVERNO_INDISPONIVEL` | nenhuma nota enviada; tente novamente com a mesma `Idempotency-Key` |

## 2. Objeto `nota`
```json
{
  "id": "UUID",
  "id_externo": "OS-55821",
  "empresa_id": "UUID",
  "ambiente": "producao",
  "situacao": "autorizada",
  "restricoes": [],
  "manifestacao": null,
  "numero": "123",
  "chave_acesso": "42122542211222333000181000000000012326110000000001",
  "serie_dps": "00001",
  "numero_dps": "57",
  "competencia": "2026-11-12",
  "emitida_em": "2026-11-12T10:15:03-03:00",
  "autorizada_em": "2026-11-12T10:15:05-03:00",
  "tomador": { "tipo": "pj", "documento": "99888777000166", "nome": "Cliente Exemplo LTDA" },
  "servico": { "servico_id": "UUID", "codigo_servico": "140101", "descricao": "Vistoria veicular — placa ABC1D23" },
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
  "local_prestacao": { "codigo_municipio": "4212254", "municipio": "Passo de Torres", "uf": "SC" },
  "erros_governo": [],
  "substitui_nota_id": null,
  "substituida_por_nota_id": null,
  "links": {
    "xml": "https://app.notemfiscal.com.br/api/v1/notas/UUID/xml",
    "pdf": "https://app.notemfiscal.com.br/api/v1/notas/UUID/pdf",
    "consulta_publica": "link oficial do portal da NFS-e para esta chave"
  },
  "criada_em": "2026-11-12T10:15:03-03:00",
  "atualizada_em": "2026-11-12T10:15:05-03:00"
}
```

**`situacao`**: `processando`, `em_verificacao`, `autorizada`, `rejeitada`, `cancelamento_em_analise`, `cancelada`, `substituida`, `cancelada_prefeitura`.
**`restricoes`**: ações bloqueadas pela prefeitura (ex.: `["cancelamento"]`).
**`manifestacao`**: `null` ou `{ "tipo": "confirmacao" | "rejeicao" | "confirmacao_tacita", "autor": "tomador" | "prestador" | "intermediario", "em": "...", "motivo": "..." }`.
Valores de ISS (`aliquota_iss`, `valor_iss`) vêm da nota autorizada pelo governo; ficam `null` quando não destacados (ex.: Simples Nacional sem retenção).

## 3. Consultar
| Rota | Descrição |
|---|---|
| `GET /notas` | Lista paginada. Filtros: `empresa_id`, `empresa_id_externo`, `situacao`, `id_externo`, `tomador_documento`, `emitida_de`, `emitida_ate` |
| `GET /notas/{id}` | Nota completa |
| `GET /notas/{id}/xml` | XML oficial da NFS-e autorizada (`application/xml`) |
| `GET /notas/{id}/pdf` | DANFSe em PDF (`application/pdf`), no padrão oficial (NT 008), sempre gerado com a situação atual (ex.: marca "CANCELADA") |

Os links `xml` e `pdf` exigem a chave da integração. O parceiro baixa e entrega ao seu cliente; a notem não envia a nota ao tomador.

## 4. Tomadores cadastrados (opcional)
Para não repetir os dados do cliente em cada nota. **Cada tomador pertence a uma empresa** (os clientes de uma empresa nunca aparecem para outra).

| Rota | Descrição |
|---|---|
| `POST /empresas/{id}/tomadores` | Cadastra (mesmos campos do objeto `tomador`, mais `id_externo` opcional, único por empresa) |
| `GET /empresas/{id}/tomadores` | Lista; filtros `documento`, `id_externo`, `busca` |
| `GET` / `PATCH /empresas/{id}/tomadores/{tomador_id}` | Consulta / altera |

Na emissão, `tomador_id` ou `tomador_id_externo` usa o cadastro; os dados são **copiados para a nota** no momento da emissão (alterar o tomador depois não muda notas já emitidas).

## 5. Webhooks de nota
Todos os eventos `nota.*` trazem em `dados` o **objeto `nota` completo** (seção 2), sem o conteúdo do XML/PDF (use os links).

## 6. Fora desta versão
- Cancelamento e substituição (próxima fase).
- Intermediário do serviço.
- Grupo IBS/CBS: entra em fase própria, antes de 01/01/2027 (obrigatório para todos a partir dessa data).

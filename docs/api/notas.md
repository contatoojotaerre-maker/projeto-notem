# API da notem — Notas (emissão e consulta)

Leia antes `convencoes.md` e `empresas.md`. Cancelamento, análise fiscal do cancelamento e substituição estão em `cancelamento.md`.

## Regras gerais
- A nota é emitida no **ambiente da chave**: homologação (sem validade fiscal) ou produção.
- Antes de enviar ao governo, a notem confere se a empresa está **pronta para emitir** (`/empresas/{id}/situacao`). Se não estiver: `422 EMPRESA_NAO_PRONTA`, com as pendências em `detalhes`. Nada é enviado nem numerado.
- `Idempotency-Key` é **obrigatório** em `POST /notas`. Reenviar a mesma chave (ex.: após queda de conexão) **nunca** gera uma segunda nota.
- Exceção à janela genérica de 24 horas: a associação entre a chave e a nota é permanente por integração e ambiente. A chave associada a uma nota não pode ser reutilizada para outra. Mesmo conteúdo durante processamento/verificação responde `202` com a nota atual; conteúdo diferente responde `409 IDEMPOTENCIA_CONFLITO`. Após conclusão, a repetição preserva o resultado da emissão.
- E0202: CPF/CNPJ do tomador igual ao do prestador é recusado antes de numerar: "O tomador não pode ser a própria empresa emitente" (`422 REGRA_DE_NEGOCIO`, campo `tomador.documento`). Aplica-se a tomador informado e cadastrado.
- E0710/E0712/E0713: configuração incompatível com a matriz de `empresas.md` é incompleta, sem reescrita automática; recusar antes de numerar com a mensagem da regra.
- E0174/E0175: regime especial deve ser `nenhum` para MEI ou ME/EPP com apuração dentro do Simples. E0172: também para serviço com imunidade, exportação ou não incidência. Configurações antigas são preservadas, avisadas no painel e consideradas incompletas; recusar antes de numerar.
- E0204/E0237: ISS retido pelo tomador exige CPF/CNPJ e endereço nacional completo (CEP, município IBGE, logradouro, número e bairro). A validação usa o cadastro copiado ou o tomador informado, antes da numeração.
- Textos (nomes, endereços, e-mail, descrição, informações complementares) são normalizados antes de validar, conforme `convencoes.md` (seção 4.1). A nota guarda e envia o texto já normalizado; caracteres sem equivalente retornam `422 REGRA_DE_NEGOCIO` com o campo e a mensagem "contém caracteres não aceitos pela NFS-e", antes de numerar.
- A numeração (série e número da DPS) é feita pela notem. Um número usado nunca é reaproveitado, mesmo se a nota for rejeitada.
- CNPJ alfanumérico (emitente ou tomador): aceito em homologação. Em produção, só a partir da vigência do leiaute da NT 009; antes dela a nota é recusada antes de numerar (`422 REGRA_DE_NEGOCIO`, campo `empresa.cnpj` ou `tomador.documento`): "CNPJ alfanumérico só pode ser usado em produção a partir da vigência da NT 009 (dd/mm/aaaa)".
- Substituição ou cancelamento de nota cuja chave tem letras: se o governo recusar por falha de esquema da chave (defeito conhecido no esquema oficial), a mensagem é "O governo recusou a chave de acesso com CNPJ alfanumérico por um defeito conhecido no esquema oficial. Tente novamente mais tarde ou use o Portal Nacional." O código e a mensagem originais do governo continuam em `detalhes`.

## 1. Emitir nota — `POST /notas`

### Pedido
```json
{
  "empresa_id": "UUID",
  "id_externo": "OS-55821",
  "servico_id": "UUID",
  "competencia": "2026-11-12",
  "descricao": "Vistoria veicular - placa ABC1D23",
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
| `valores.desconto_*` | opcionais; padrão `"0.00"`. E0431/E0432: zero é omitido na DPS; só valores positivos são enviados. Sem ambos, omitir todo `vDescCondIncond`. Descontos não podem superar o serviço |
| `retencao_iss` | opcional; substitui a retenção padrão do serviço (`nao_retido`, `retido_tomador`, `retido_intermediario`) |
| `aliquota_iss_simples` | opcional; substitui a da configuração fiscal. Usada **somente** quando há retenção e a empresa é ME/EPP no Simples |
| `local_prestacao.codigo_municipio` | opcional; padrão = município da empresa |
| `informacoes_complementares` | opcional; até 2.000 caracteres |

A **alíquota do ISS** não é enviada pelo parceiro: o governo aplica a do município (parâmetros oficiais), exceto nos casos previstos para o Simples Nacional.

### Tomador
| Campo | Regra |
|---|---|
| `tipo` | `pj`, `pf` ou `estrangeiro` |
| `documento` | CNPJ (14 posições, numérico ou alfanumérico) para `pj`; CPF (11 números) para `pf`; ausente para `estrangeiro`. Máscara e minúsculas são normalizadas |
| `nif` | estrangeiro: número de identificação fiscal do país (ou `null` com `motivo_sem_nif`) |
| `nome` | obrigatório |
| `email`, `telefone`, `inscricao_municipal` | opcionais |
| `endereco` | nacional: `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `codigo_municipio`. Estrangeiro: `pais` (ISO 2), `cidade`, `codigo_postal`, `estado_provincia_regiao`, `logradouro` ou `endereco_livre`, `numero`, `bairro`, `complemento` opcional |
| `motivo_sem_nif` | estrangeiro sem NIF: `dispensado` (cNaoNIF = 1) ou `nao_exigido` (cNaoNIF = 2). NIF e motivo são exclusivos; código 0 não é oferecido |

Endereço é opcional. Quando informado, todos os campos exigidos pelo XSD devem estar presentes; não são inventados número, bairro ou província. `endereco_livre` é usado como logradouro quando `logradouro` não vier. CPF/CNPJ têm dígitos verificadores validados; município/país vêm dos catálogos oficiais.

### Resposta
A notem envia ao governo e **aguarda o resultado por até cerca de 20 segundos**:

| Resultado | Status | Corpo |
|---|---|---|
| Autorizada | `201` | objeto `nota` com `situacao: "autorizada"` |
| Governo demorou ou a conexão caiu | `202` | objeto `nota` com `situacao: "em_verificacao"`. A notem confirma sozinha e avisa por webhook (`nota.autorizada` ou `nota.rejeitada`). Não reenvie com outra `Idempotency-Key` |
| Rejeitada pelo governo | `422 REJEITADO_GOVERNO` | erro padrão; `detalhes` traz cada motivo do governo (`codigo_governo`, mensagem original e explicação em português) e `nota_id` da nota registrada como `rejeitada` |
| Validação antes do envio | `422 REGRA_DE_NEGOCIO` / `EMPRESA_NAO_PRONTA` / `400` | nenhuma nota criada, nenhum número usado |
| Governo fora do ar antes do envio | `503 GOVERNO_INDISPONIVEL` | nenhuma nota enviada; tente novamente com a mesma `Idempotency-Key` |

Quando a notem confirma que o pedido não chegou ao serviço de emissão, repetir a mesma `Idempotency-Key` mantém a mesma DPS e número. Se houver dúvida sobre o envio, a nota fica em verificação para evitar duplicidade.

Na rejeição, cada item de `erro.detalhes` mantém `campo`/`mensagem` e acrescenta `codigo_governo`, `mensagem_governo`, `complemento` e `nota_id`. Preservar mensagem original; tradução só quando confirmada pela tabela oficial. Nunca expor erro técnico interno.

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
  "serie_dps": "00900",
  "numero_dps": "57",
  "competencia": "2026-11-12",
  "emitida_em": "2026-11-12T10:15:03-03:00",
  "autorizada_em": "2026-11-12T10:15:05-03:00",
  "tomador": { "tipo": "pj", "documento": "99888777000166", "nome": "Cliente Exemplo LTDA" },
  "servico": { "servico_id": "UUID", "codigo_servico": "140101", "descricao": "Vistoria veicular - placa ABC1D23" },
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
  "operacao_pendente": null,
  "cancelamento": null,
  "links": {
    "xml": "https://app.notemfiscal.com.br/api/v1/notas/UUID/xml",
    "pdf": "https://app.notemfiscal.com.br/api/v1/notas/UUID/pdf",
    "consulta_publica": "https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=42122542211222333000181000000000012326110000000001"
  },
  "criada_em": "2026-11-12T10:15:03-03:00",
  "atualizada_em": "2026-11-12T10:15:05-03:00"
}
```

**`situacao`**: `processando`, `em_verificacao`, `autorizada`, `rejeitada`, `cancelamento_em_analise`, `cancelada`, `substituida`, `cancelada_prefeitura`.
**`restricoes`**: ações bloqueadas pela prefeitura (ex.: `["cancelamento"]`).
**`manifestacao`**: `null` ou `{ "tipo": "confirmacao" | "rejeicao" | "confirmacao_tacita", "autor": "tomador" | "prestador" | "intermediario", "em": "...", "motivo": "..." }`.
**`operacao_pendente`**: `null` ou `{ "tipo": "cancelamento" | "analise_cancelamento", "estado": "em_verificacao", "desde": "..." }` enquanto a notem aguarda a confirmação do governo; a `situacao` continua `autorizada` até a confirmação.
**`cancelamento`**: `null` ou o último pedido de cancelamento/análise (detalhes em `cancelamento.md`).
**`substitui_nota_id` / `substituida_por_nota_id`**: ligação entre a nota substituta e a original.
Valores de ISS (`aliquota_iss`, `valor_iss`) vêm da nota autorizada pelo governo; ficam `null` quando não destacados (ex.: Simples Nacional sem retenção).

## 3. Consultar
| Rota | Descrição |
|---|---|
| `GET /notas` | Lista paginada. Filtros: `empresa_id`, `empresa_id_externo`, `situacao`, `id_externo`, `tomador_documento`, `emitida_de`, `emitida_ate`, `origem` (`notem` ou `externa`) |
| `GET /notas/{id}` | Nota completa |
| `GET /notas/{id}/xml` | XML oficial da NFS-e autorizada (`application/xml`) |
| `GET /notas/{id}/eventos/{codigo}/xml` | XML oficial do evento registrado (`101101` cancelamento, `101103` análise fiscal) |
| `GET /notas/{id}/pdf` | `200 application/pdf`, DANFSe v2.0 em A4, sob demanda; `404` sem XML autorizado ou fora de autorizada/cancelada/substituída (inclui cancelada pela prefeitura) |

Os links `xml` e `pdf` exigem a chave da integração. O parceiro baixa e entrega ao seu cliente; a notem não envia a nota ao tomador.

### Notas emitidas fora da notem (`origem: "externa"`)
Notas emitidas por outro sistema ou pelo Portal Nacional para empresas da organização aparecem em `GET /notas` depois da sincronização com o governo (veja `sincronizacao.md`). Têm o mesmo formato do objeto `nota`, com `origem: "externa"`, `id_externo: null` e `servico.servico_id: null`. XML e PDF funcionam normalmente. São somente leitura: `cancelar`, `solicitar-analise-cancelamento` e `substituir` respondem `409 CONFLITO` com a mensagem "Nota emitida fora da notem. Cancele ou substitua pelo sistema que a emitiu ou pelo Portal Nacional." As notas emitidas pela notem trazem `origem: "notem"`.

### Notas recebidas
Notas em que a empresa é tomadora ou intermediária ficam em `GET /empresas/{id}/notas-recebidas` (veja `sincronizacao.md`).

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
- Intermediário do serviço.
- Emissão com grupo IBS/CBS. Operações que exijam esse grupo não são aceitas nesta versão.

## Confirmação automática e reenvio seguro
- Notas em verificação são acompanhadas automaticamente, sem retransmitir pedidos de resultado incerto.
- A confirmação começa após cerca de um minuto. Somente ausência confirmada pelo governo após 15 minutos permite rejeitar como **“O governo não gerou esta nota”**; falhas de conexão mantêm a verificação.
- `consulta_publica`: `https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave_acesso}` quando existe chave válida; caso contrário `null`. XML/PDF exigem a chave da integração; outra organização ou ambiente recebe `404`.

## DANFSe v2.0
O PDF representa somente os dados do XML autorizado, sem completar informações pelos cadastros atuais; ausentes aparecem como `-`. Notas canceladas ou substituídas mostram a marca correspondente; homologação mostra **NFS-e SEM VALIDADE JURÍDICA**. A opção `imprimir_canhoto_danfse` da configuração fiscal é `false` por padrão.
O QR Code usa a mesma URL de consulta pública do objeto nota. PIS/COFINS de apuração própria aparece apenas até competência 31/12/2026. Os tributos aproximados são os informados no XML. Sem valores IBS/CBS, os campos permanecem `-`.

## Numeração e DPS existente (E0014)
Novas séries são atribuídas automaticamente a partir de **00900**, até 49999; séries e números existentes são preservados.
Quando o governo rejeita o envio exclusivamente com E0014 (DPS já existente), a notem pode avançar até cinco números, além da tentativa inicial. Números recusados nunca são reaproveitados. O ID da nota, a `Idempotency-Key` e os dados do pedido permanecem iguais; repetir a chave não reinicia o limite.
Não há webhook de rejeição intermediária. Se a confirmação demandar mais tempo, a API responde `202` e o parceiro acompanha a mesma nota por consulta ou webhook. Respostas incertas nunca permitem avançar o número; outros códigos ou rejeições combinadas seguem o tratamento normal. Ao esgotar o limite ou a numeração, a nota fica rejeitada com orientação nos detalhes.

## Orientações para rejeições confirmadas no Anexo I
| Código | Orientação prática |
|---|---|
| E0116 | Informar a inscrição municipal registrada pela prefeitura no CNC; confirmar o cadastro municipal |
| E0120 | Não informar inscrição municipal quando não houver cadastro complementar no CNC; conferir com a prefeitura |
| E0160 | Conferir situação no Simples na Receita e configuração fiscal na competência da nota |
| E0240 | Conferir se o CEP existe e pertence ao município do tomador |
| E0190 / E0207 | Conferir CNPJ/CPF do tomador e existência na Receita na competência |
| E0008 | Conferir data/hora de emissão e relógio; não pode ser posterior ao processamento pelo governo |
| E0015 | Competência não pode ser posterior à emissão |
| E0714 | Conferir validade do certificado e os detalhes da assinatura recusada pelo governo |
Os detalhes preservam código, mensagem e complemento originais do governo; a explicação em português não os substitui.


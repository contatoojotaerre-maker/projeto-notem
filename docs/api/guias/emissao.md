---
titulo: Emissão de notas
ordem: 6
atualizado: 2026-11-26
descricao: Como emitir a NFS-e: pedido, tomador, resposta, numeração, reenvio seguro, consultas, XML e PDF.
---

# Emissão de notas

Cancelamento, análise fiscal do cancelamento e substituição estão em [Cancelamento](cancelamento.md) e [Substituição](substituicao.md).

## Regras gerais
- **A nota sai no ambiente da chave.** Com a chave de homologação, a nota é de teste e não tem validade fiscal; com a de produção, é uma nota real.
- **A empresa precisa estar pronta para emitir.** A notem confere isso antes de enviar, com o mesmo cálculo de [Consultar situação](op:consultarSituacao). Se faltar algo (certificado, configuração fiscal, serviço), a resposta é `422 EMPRESA_NAO_PRONTA` com as pendências em `detalhes`, e nada é enviado ao governo.
- **Os erros mais comuns são recusados antes de gerar o número da nota.** Assim um dado errado não gasta um número. Nesses casos a resposta é `422 REGRA_DE_NEGOCIO`, com o campo e o motivo. As conferências são as mesmas que o governo faria:
  - o tomador não pode ser a própria empresa (E0202 — o CPF/CNPJ do tomador é igual ao da empresa emitente), seja o tomador informado no pedido ou o cadastrado;
  - a configuração fiscal precisa seguir as combinações aceitas pelo governo (veja [Configuração fiscal](configuracao-fiscal.md#tributos-aproximados-o-que-cada-situacao-aceita)); configurações antigas fora da regra não são alteradas sozinhas e bloqueiam a emissão até serem corrigidas;
  - o regime especial precisa ser `nenhum` para MEI, para ME/EPP com apuração dentro do Simples e para serviço imune, de exportação ou sem incidência do ISS (veja [Configuração fiscal](configuracao-fiscal.md#regime-especial-quando-precisa-ser-nenhum));
  - ISS retido pelo tomador exige tomador com CPF/CNPJ e endereço completo no Brasil: CEP, município, logradouro, número e bairro (E0204 — retenção sem CPF/CNPJ do tomador; E0237 — retenção sem endereço do tomador no Brasil).
- **Os textos são ajustados antes da conferência.** Nomes, endereços, e-mail, descrição e informações complementares passam pelo ajuste descrito em [Texto aceito pela NFS-e](../primeiros-passos/requisicoes.md#texto-aceito-pela-nfs-e), e a nota guarda o texto ajustado. Um caractere sem equivalente, como um emoji, é recusado com `422 REGRA_DE_NEGOCIO`, o campo e a mensagem "contém caracteres não aceitos pela NFS-e".
- **A notem cuida da numeração.** Cada nota recebe uma série e um número de DPS (a declaração que a notem envia ao governo para gerar a nota). Um número usado nunca é reaproveitado, mesmo que a nota seja recusada, porque o governo pode já ter registrado aquele número.
- **PIS/COFINS vem da configuração da empresa.** Se `pis_cofins` estiver configurado com CST `"99"` e retenção `"0"`, a DPS leva esse grupo, sem base, alíquotas ou valores. Sem configuração, omite `tribFed`. A nota guarda a escolha na criação: editar a empresa não altera notas anteriores ou tentativas do mesmo pedido. **Reenvie SEMPRE `pis_cofins` em cada PUT de configuração fiscal para manter a escolha**; omitir ou enviar `null` remove a configuração. Veja [PIS/COFINS](configuracao-fiscal.md#pis-cofins-escolha-opcional-por-empresa).
- **`Idempotency-Key` é obrigatório.** Repetir o pedido com a mesma chave nunca gera uma segunda nota. Veja [Reenvio seguro](#reenvio-seguro).
- Para CNPJ com letras, do emitente ou do tomador, veja [CNPJ alfanumérico](cnpj-alfanumerico.md).

## Emitir nota — `POST /notas`

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
    "documento": "99888777000100",
    "nome": "Cliente Exemplo LTDA",
    "email": "financeiro@exemplo.com.br",
    "telefone": "48999990000",
    "inscricao_municipal": null,
    "endereco": {
      "cep": "88010000", "logradouro": "Rua A", "numero": "10", "complemento": null,
      "bairro": "Centro", "codigo_municipio": "4205407"
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
| `valores.desconto_*` | opcionais; padrão `"0.00"`. Desconto zero não é enviado ao governo, que só aceita desconto maior que zero. O desconto não pode ser maior que o valor do serviço |
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
| `motivo_sem_nif` | estrangeiro sem NIF: `dispensado` (o tomador é dispensado do NIF) ou `nao_exigido` (o país não exige NIF). Informe o NIF ou o motivo, nunca os dois |

O endereço é opcional. Quando informado, precisa estar completo, porque o governo recusa endereço pela metade e a notem não inventa número, bairro ou província. `endereco_livre` é usado como logradouro quando `logradouro` não vier. CPF/CNPJ têm dígitos verificadores validados; município/país vêm dos catálogos oficiais.

### Resposta
A notem envia ao governo e **aguarda o resultado por até cerca de 20 segundos**:

| Resultado | Status | Corpo |
|---|---|---|
| Autorizada | `201` | objeto `nota` com `situacao: "autorizada"` |
| Governo demorou ou a conexão caiu | `202` | objeto `nota` com `situacao: "em_verificacao"`. A notem confirma sozinha e avisa por webhook (`nota.autorizada` ou `nota.rejeitada`). Não reenvie com outra `Idempotency-Key` |
| Rejeitada pelo governo | `422 REJEITADO_GOVERNO` | erro padrão; `detalhes` traz cada motivo do governo (`codigo_governo`, mensagem original e explicação em português) e `nota_id` da nota registrada como `rejeitada` |
| Validação antes do envio | `422 REGRA_DE_NEGOCIO` / `EMPRESA_NAO_PRONTA` / `400` | nenhuma nota criada, nenhum número usado |
| Governo fora do ar antes do envio | `503 GOVERNO_INDISPONIVEL` | nenhuma nota enviada; tente novamente com a mesma `Idempotency-Key` |

Na recusa do governo, cada item de `erro.detalhes` traz `campo` e `mensagem` em português e também `codigo_governo`, `mensagem_governo` (o texto original do governo), `complemento` e `nota_id`. O significado de cada código e o que fazer estão em [Rejeições do governo](../referencia/rejeicoes-do-governo.md).

## Reenvio seguro
**Se a conexão cair e você não souber se a nota foi emitida, consulte a nota antes de tentar de novo** (pelo ID ou em [Listar notas](op:listarNotas) com o filtro `id_externo`). Repetir o pedido com a mesma `Idempotency-Key` também é seguro: a notem reconhece o pedido e devolve a mesma nota, sem emitir outra.

- **Nunca troque a `Idempotency-Key` para repetir o mesmo pedido.** Com uma chave nova, a notem entende que é outra nota e pode emitir duas.
- **A chave fica ligada à nota para sempre.** Na emissão, ela não expira em 24 horas como nas outras operações. Repetir a chave com o mesmo conteúdo devolve a nota (`202` enquanto o resultado não sai; o resultado final depois). Repetir com conteúdo diferente responde `409 IDEMPOTENCIA_CONFLITO`.
- **Quando o governo não responde a tempo, a notem não reenvia às cegas.** A nota fica `em_verificacao` e a notem pergunta ao governo se ela foi gerada, para não emitir duas vezes. A primeira consulta acontece cerca de um minuto depois. O resultado chega por webhook (`nota.autorizada` ou `nota.rejeitada`) e também aparece em [Consultar nota](op:consultarNota).
- **A nota só é dada como não emitida quando o governo confirma.** Se depois de 15 minutos o governo informar que não existe nota para aquele pedido, a nota fica rejeitada com a mensagem **“O governo não gerou esta nota”**. Falhas de conexão nessa consulta não encerram a verificação.
- **Se a notem tiver certeza de que o pedido não chegou ao governo**, por exemplo porque o governo estava fora do ar, a resposta é `503 GOVERNO_INDISPONIVEL`. Repita com a mesma `Idempotency-Key`: a nota mantém a mesma série e o mesmo número.

## Número já usado (E0014)
A notem atribui a cada empresa uma série a partir de **00900** (até 49999) e preserva séries e números que a empresa já usava. Se o governo recusar a nota só porque o número já foi usado (E0014 — já existe uma nota da empresa com essa série e número, por exemplo emitida por outro sistema), a notem tenta sozinha os números seguintes, até cinco vezes.

- O ID da nota, a `Idempotency-Key` e os dados do pedido não mudam. Repetir a chave não reinicia as tentativas.
- Não há webhook para as tentativas intermediárias. Se elas demorarem, a resposta é `202` e você acompanha a mesma nota por consulta ou webhook.
- A notem só avança o número quando tem certeza da recusa. Se a recusa trouxer outros motivos além do número usado, ela segue o tratamento normal.
- Se as cinco tentativas ou a série se esgotarem, a nota fica rejeitada, com a orientação em `detalhes`.

## Consulta pública
`links.consulta_publica` leva à página do governo onde qualquer pessoa confere a nota: `https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave_acesso}`. Fica `null` enquanto a nota não tem chave de acesso válida.

## Consultar
| Rota | Descrição |
|---|---|
| `GET /notas` | Lista paginada. Filtros: `empresa_id`, `empresa_id_externo`, `situacao`, `id_externo`, `tomador_documento`, `emitida_de`, `emitida_ate`, `origem` (`notem` ou `externa`) |
| `GET /notas/{id}` | Nota completa |
| `GET /notas/{id}/xml` | XML oficial da NFS-e autorizada (`application/xml`) |
| `GET /notas/{id}/eventos/{codigo}/xml` | XML oficial do evento registrado (`101101` cancelamento, `101103` análise fiscal) |
| `GET /notas/{id}/pdf` | `200 application/pdf`, DANFSe v2.0 em A4, sob demanda; `404` sem XML autorizado ou fora de autorizada/cancelada/substituída (inclui cancelada pela prefeitura) |

Os links `xml` e `pdf` exigem a chave da integração; com chave de outra organização ou de outro ambiente, a resposta é `404`. Você baixa os arquivos e os entrega ao seu cliente: a notem não envia a nota ao tomador.

### Notas emitidas fora da notem (`origem: "externa"`)
Notas emitidas por outro sistema ou pelo Portal Nacional para empresas da organização aparecem em `GET /notas` depois da sincronização com o governo (veja [Notas recebidas e sincronização](notas-recebidas.md)). Têm o mesmo formato do objeto `nota`, com `origem: "externa"`, `id_externo: null` e `servico.servico_id: null`. XML e PDF funcionam normalmente. São somente leitura: `cancelar`, `solicitar-analise-cancelamento` e `substituir` respondem `409 CONFLITO` com a mensagem "Nota emitida fora da notem. Cancele ou substitua pelo sistema que a emitiu ou pelo Portal Nacional." As notas emitidas pela notem trazem `origem: "notem"`.

### Notas recebidas
Notas em que a empresa é tomadora ou intermediária ficam em `GET /empresas/{id}/notas-recebidas` (veja [Notas recebidas e sincronização](notas-recebidas.md)).

## DANFSe v2.0
O PDF representa somente os dados do XML autorizado, sem completar informações pelos cadastros atuais; ausentes aparecem como `-`. Notas canceladas ou substituídas mostram a marca correspondente; homologação mostra **NFS-e SEM VALIDADE JURÍDICA**. A opção `imprimir_canhoto_danfse` da configuração fiscal é `false` por padrão.
O QR Code usa a mesma URL de consulta pública do objeto nota. PIS/COFINS de apuração própria aparece apenas até competência 31/12/2026. Os tributos aproximados são os informados no XML. Sem valores IBS/CBS, os campos permanecem `-`.

## Tomadores cadastrados (opcional)
Para não repetir os dados do cliente em cada nota. **Cada tomador pertence a uma empresa** (os clientes de uma empresa nunca aparecem para outra).

| Rota | Descrição |
|---|---|
| `POST /empresas/{id}/tomadores` | Cadastra (mesmos campos do objeto `tomador`, mais `id_externo` opcional, único por empresa) |
| `GET /empresas/{id}/tomadores` | Lista; filtros `documento`, `id_externo`, `busca` |
| `GET` / `PATCH /empresas/{id}/tomadores/{tomador_id}` | Consulta / altera |

Na emissão, `tomador_id` ou `tomador_id_externo` usa o cadastro; os dados são **copiados para a nota** no momento da emissão (alterar o tomador depois não muda notas já emitidas).

## Fora desta versão
- Intermediário do serviço.

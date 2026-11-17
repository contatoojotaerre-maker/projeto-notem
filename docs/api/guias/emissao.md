---
titulo: Emissão de notas
ordem: 6
atualizado: 2026-11-17
descricao: Como emitir a NFS-e: pedido, tomador, resposta, numeração, reenvio seguro, consultas, XML e PDF.
---

# Emissão de notas

Cancelamento, análise fiscal do cancelamento e substituição estão em [Cancelamento](cancelamento.md) e [Substituição](substituicao.md).

## Regras gerais
- A nota é emitida no **ambiente da chave**: homologação (sem validade fiscal) ou produção.
- Antes de enviar ao governo, a notem confere se a empresa está **pronta para emitir** (`/empresas/{id}/situacao`). Se não estiver: `422 EMPRESA_NAO_PRONTA`, com as pendências em `detalhes`. Nada é enviado nem numerado.
- `Idempotency-Key` é **obrigatório** em `POST /notas`. Reenviar a mesma chave (ex.: após queda de conexão) **nunca** gera uma segunda nota.
- Exceção à janela genérica de 24 horas: a associação entre a chave e a nota é permanente por integração e ambiente. A chave associada a uma nota não pode ser reutilizada para outra. Mesmo conteúdo durante processamento/verificação responde `202` com a nota atual; conteúdo diferente responde `409 IDEMPOTENCIA_CONFLITO`. Após conclusão, a repetição preserva o resultado da emissão.
- E0202: CPF/CNPJ do tomador igual ao do prestador é recusado antes de numerar: "O tomador não pode ser a própria empresa emitente" (`422 REGRA_DE_NEGOCIO`, campo `tomador.documento`). Aplica-se a tomador informado e cadastrado.
- E0710/E0712/E0713: configuração incompatível com a [matriz da configuração fiscal](configuracao-fiscal.md#matriz-obrigatoria-e0710-e0712-e-e0713) deixa a configuração incompleta; a emissão é recusada antes de numerar, com a mensagem da regra.
- E0174/E0175: regime especial deve ser `nenhum` para MEI ou ME/EPP com apuração dentro do Simples. E0172: também para serviço com imunidade, exportação ou não incidência. Configurações antigas são preservadas, avisadas no painel e consideradas incompletas; recusar antes de numerar.
- E0204/E0237: ISS retido pelo tomador exige CPF/CNPJ e endereço nacional completo (CEP, município IBGE, logradouro, número e bairro). A validação usa o cadastro copiado ou o tomador informado, antes da numeração.
- Textos (nomes, endereços, e-mail, descrição, informações complementares) são normalizados antes de validar, conforme [Texto aceito pela NFS-e](../primeiros-passos/requisicoes.md#texto-aceito-pela-nfs-e). A nota guarda e envia o texto já normalizado; caracteres sem equivalente retornam `422 REGRA_DE_NEGOCIO` com o campo e a mensagem "contém caracteres não aceitos pela NFS-e", antes de numerar.
- A numeração (série e número da DPS) é feita pela notem. Um número usado nunca é reaproveitado, mesmo se a nota for rejeitada.
- CNPJ alfanumérico do emitente ou do tomador: veja [CNPJ alfanumérico](cnpj-alfanumerico.md).

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

## Numeração e DPS existente (E0014)
Novas séries são atribuídas automaticamente a partir de **00900**, até 49999; séries e números existentes são preservados.
Quando o governo rejeita o envio exclusivamente com E0014 (DPS já existente), a notem pode avançar até cinco números, além da tentativa inicial. Números recusados nunca são reaproveitados. O ID da nota, a `Idempotency-Key` e os dados do pedido permanecem iguais; repetir a chave não reinicia o limite.
Não há webhook de rejeição intermediária. Se a confirmação demandar mais tempo, a API responde `202` e o parceiro acompanha a mesma nota por consulta ou webhook. Respostas incertas nunca permitem avançar o número; outros códigos ou rejeições combinadas seguem o tratamento normal. Ao esgotar o limite ou a numeração, a nota fica rejeitada com orientação nos detalhes.

## Confirmação automática e reenvio seguro
- Notas em verificação são acompanhadas automaticamente, sem retransmitir pedidos de resultado incerto.
- A confirmação começa após cerca de um minuto. Somente ausência confirmada pelo governo após 15 minutos permite rejeitar como **“O governo não gerou esta nota”**; falhas de conexão mantêm a verificação.
- `consulta_publica`: `https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave={chave_acesso}` quando existe chave válida; caso contrário `null`. XML/PDF exigem a chave da integração; outra organização ou ambiente recebe `404`.

## Consultar
| Rota | Descrição |
|---|---|
| `GET /notas` | Lista paginada. Filtros: `empresa_id`, `empresa_id_externo`, `situacao`, `id_externo`, `tomador_documento`, `emitida_de`, `emitida_ate`, `origem` (`notem` ou `externa`) |
| `GET /notas/{id}` | Nota completa |
| `GET /notas/{id}/xml` | XML oficial da NFS-e autorizada (`application/xml`) |
| `GET /notas/{id}/eventos/{codigo}/xml` | XML oficial do evento registrado (`101101` cancelamento, `101103` análise fiscal) |
| `GET /notas/{id}/pdf` | `200 application/pdf`, DANFSe v2.0 em A4, sob demanda; `404` sem XML autorizado ou fora de autorizada/cancelada/substituída (inclui cancelada pela prefeitura) |

Os links `xml` e `pdf` exigem a chave da integração. O parceiro baixa e entrega ao seu cliente; a notem não envia a nota ao tomador.

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

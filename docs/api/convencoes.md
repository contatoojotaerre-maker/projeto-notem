# Convenções da API da notem (v1)

Estas regras valem para **todas** as rotas. Em caso de dúvida, elas prevalecem sobre exemplos isolados.

## 1. Endereço e versão
- Base oficial: `https://app.notemfiscal.com.br/api/v1`.
- Toda rota começa com `/api/v1`. Mudanças **compatíveis** (novos campos, novas rotas, novos valores opcionais) acontecem dentro da v1 sem aviso prévio. Mudanças **incompatíveis** só em uma nova versão (`/api/v2`), com prazo de convivência comunicado.
- O sistema parceiro **deve ignorar campos que não conhece** nas respostas.

## 2. Autenticação e ambientes
- Cada **integração** de uma organização tem **uma chave por ambiente**:
- Durante a troca, são permitidas até **duas chaves ativas por integração e ambiente**. Gere a nova, atualize o sistema parceiro e revogue a antiga.
- **Chaves não expiram**: valem até serem revogadas. A revogação tem efeito imediato. Não há revogação automática nem prazo.
- Ao criar uma organização, a notem cria automaticamente uma integração com o mesmo nome, sem chaves. Ela pode ser renomeada, e outras integrações podem ser criadas.
  - Homologação: começa com `ntm_homolog_`
  - Produção: começa com `ntm_prod_`
- Enviar em todas as chamadas: `Authorization: Bearer {chave}`.
- **O ambiente é definido pela chave**. Não existe parâmetro de ambiente: com a chave de homologação, tudo acontece em homologação (notas sem validade fiscal); com a de produção, em produção.
- A chave é exibida **uma única vez** ao ser criada. A notem guarda apenas uma impressão irreversível dela. Se perdida, gere outra e revogue a antiga.
- Uma integração opera **todas as empresas da sua organização** (não há seleção de empresas por integração). Empresa de outra organização responde `404 NAO_ENCONTRADO`.

## 3. Formato das mensagens
- JSON em UTF-8: `Content-Type: application/json; charset=utf-8`.
- **Nomes de campos em português**, minúsculos, sem acentos, separados por sublinhado: `razao_social`, `valor_servico`, `codigo_municipio`.
- Identificadores da notem: texto UUID no campo `id`.
- **Identificador do parceiro:** recursos criados pelo parceiro aceitam `id_externo` (texto, até 100 caracteres), único por organização, para o parceiro localizar o recurso com o próprio código.

## 4. Padrões de dados
| Tipo | Formato | Exemplo |
|---|---|---|
| Valores em reais | texto, ponto decimal, 2 casas | `"150.00"` |
| Percentuais | texto, ponto decimal, até 2 casas | `"2.00"` |
| Data | `AAAA-MM-DD` | `"2026-11-03"` |
| Data e hora | ISO 8601 com fuso | `"2026-11-03T14:30:00-03:00"` |
| CNPJ / CPF / CEP / telefone | somente números | `"11222333000181"` |
| Município | código IBGE de 7 dígitos | `"4212254"` |
| País | código ISO de 2 letras | `"BR"` |
| Booleanos | `true` / `false` | |

Valores monetários **nunca** são enviados como número (`150.0`), para evitar erros de arredondamento.

## 5. Respostas de sucesso
| Situação | Status | Corpo |
|---|---|---|
| Consulta | `200` | o recurso |
| Criação concluída | `201` | o recurso criado |
| Pedido aceito, resultado posterior (ex.: nota em verificação) | `202` | o recurso com sua situação atual |
| Lista | `200` | `{ "dados": [...], "proximo_cursor": "..." \| null }` |

## 6. Erros
Todo erro tem **sempre** o mesmo formato:

```json
{
  "erro": {
    "codigo": "REQUISICAO_INVALIDA",
    "mensagem": "Explicação em português, pronta para mostrar ao usuário.",
    "detalhes": [{ "campo": "tomador.cnpj", "mensagem": "CNPJ inválido." }],
    "codigo_governo": null,
    "mensagem_governo": null
  },
  "id_requisicao": "req_..."
}
```

- `codigo`: código estável da notem (lista abaixo). Use-o na lógica do seu sistema; a `mensagem` pode mudar de redação.
- `codigo_governo` / `mensagem_governo`: preenchidos quando o erro veio do governo (ex.: `E0014`).
- `id_requisicao`: também enviado no cabeçalho `X-Request-Id` de **toda** resposta. Informe-o ao suporte.

| Status | Código | Quando |
|---|---|---|
| 400 | `REQUISICAO_INVALIDA` | formato ou campo inválido |
| 401 | `AUTENTICACAO_INVALIDA` | chave ausente, inválida ou revogada |
| 403 | `SEM_PERMISSAO` | a integração não pode fazer esta operação |
| 403 | `EMPRESA_NAO_AUTORIZADA` | reservado (não usado: toda integração opera todas as empresas da organização) |
| 404 | `NAO_ENCONTRADO` | recurso inexistente ou de outra organização |
| 409 | `CONFLITO` | estado atual não permite a operação |
| 409 | `IDEMPOTENCIA_CONFLITO` | mesma `Idempotency-Key` com conteúdo diferente |
| 422 | `REGRA_DE_NEGOCIO` | dados válidos, mas a operação viola uma regra (inclui validações fiscais prévias) |
| 422 | `REJEITADO_GOVERNO` | o governo recusou (ver `codigo_governo`) |
| 429 | `LIMITE_EXCEDIDO` | muitas requisições; aguarde (cabeçalho `Retry-After`) |
| 502/503 | `GOVERNO_INDISPONIVEL` | serviço do governo fora do ar ou lento |
| 500 | `ERRO_INTERNO` | falha da notem; tente novamente com a mesma `Idempotency-Key` |

Códigos específicos de cada rota (ex.: `CERTIFICADO_VENCIDO`) são documentados na própria rota.

## 7. Idempotência (reenvio seguro)
- Operações que criam, alteram ou excluem (`POST`, `PATCH`, `PUT`, `DELETE`) aceitam o cabeçalho `Idempotency-Key` (texto de até 100 caracteres, gerado pelo parceiro, ex.: um UUID).
- **Obrigatório** em emissão, cancelamento e substituição de notas.
- Repetir a mesma chave com o **mesmo conteúdo** devolve a **mesma resposta**, sem refazer a operação — inclusive após falha de rede. Com conteúdo diferente: `409 IDEMPOTENCIA_CONFLITO`.
- A chave vale por 24 horas, por integração e ambiente. Depois disso pode ser reutilizada.
- A resposta repetida traz o cabeçalho `Idempotent-Replayed: true`. Enquanto a primeira requisição ainda estiver em andamento, a repetição recebe `409 CONFLITO`. Respostas `5xx` não são guardadas, para que você possa tentar de novo com a mesma chave.
- Implementado em todas as rotas de escrita da v1 (Fase 3B).

## 8. Listas e paginação
- Parâmetros: `limite` (padrão 50, máximo 100) e `cursor` (o `proximo_cursor` recebido).
- `proximo_cursor = null` indica o fim da lista.
- A ordem padrão é do mais recente para o mais antigo, salvo indicação na rota (catálogos: por nome/código).
- O `cursor` é opaco: não o monte nem o interprete.

## 9. Limites de uso
- Na Fase 3A, nenhum limite de uso está ativo; a estrutura para 429 fica preparada.
- Limite inicial por integração e ambiente (valor definido na publicação). Ao exceder: `429` com `Retry-After` em segundos.

## 10. Webhooks (visão geral; detalhes em documento próprio)
- A notem avisa o sistema parceiro sobre acontecimentos (ex.: `nota.autorizada`, `nota.cancelada`, `certificado.vencendo`).
- Nomes de eventos em português, no formato `recurso.acontecimento`.
- Cada mensagem é assinada; o parceiro deve validar a assinatura antes de confiar no conteúdo.
- Entregas com falha são repetidas automaticamente.

## 11. Segurança
- Somente HTTPS.
- Nunca envie a chave em parâmetros de URL.
- Certificados digitais enviados pela API nunca são devolvidos em nenhuma resposta.

Implementação inicial de webhooks: configuração e `webhook.teste` pelo painel; eventos fiscais reais entram nas próximas fases. A API v1 não tem endpoints de gerenciamento de webhooks. Rotas de empresas (Fase 3B): ver `empresas.md`. O agendador interno, separado do contrato v1, está documentado em `agendador-webhooks.md`.

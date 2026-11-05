# Webhooks da notem (v1)

Webhooks são **avisos automáticos** que a notem envia ao sistema parceiro quando algo acontece (ex.: nota autorizada, cancelamento pela prefeitura, certificado vencendo). Assim o parceiro não precisa consultar a API o tempo todo.

## 1. Cadastro
- Cada **integração** pode ter **endereços de webhook por ambiente** (homologação e produção), cadastrados no painel (Integrações → Webhooks) ou, futuramente, pela API.
- Para cada endereço o parceiro escolhe **quais eventos** quer receber.
- O endereço deve ser **HTTPS** e público. Endereços internos (localhost, IPs privados) são recusados.
- Ao criar o endereço, a notem gera um **segredo de assinatura** (`whsec_...`), exibido no cadastro. Depois ele fica **oculto**; o botão **Revelar** está disponível apenas para owner, admin, developer e administrador da plataforma, e cada revelação registra quem revelou e quando. O segredo pode ser trocado a qualquer momento.
- **Chave de autorização (opcional):** o parceiro pode informar um valor escolhido por ele e, opcionalmente, o nome do cabeçalho (padrão `Authorization`). Quando preenchida, a chave é enviada em todas as entregas, junto com a assinatura. Fica guardada cifrada e nunca aparece em registros. Não são aceitos nomes `Notem-*` nem cabeçalhos de protocolo (`Host`, `Content-Length`, `Content-Type`, `Transfer-Encoding`, `Connection`, `Cookie` etc.).
- **Filtro por empresa (opcional):** o endereço pode receber eventos de apenas uma das empresas autorizadas da integração. Vazio = todas. O `webhook.teste` é sempre entregue.
- No cadastro e no detalhe de cada endereço, o painel mostra o **exemplo do envio como comando curl** pronto, com botão copiar, nas versões Linux/macOS e PowerShell (`curl.exe`): POST para a URL cadastrada com `Content-Type`, `Notem-Evento`, `Notem-Evento-Id`, `Notem-Entrega-Id`, `Notem-Assinatura` (valor ilustrativo) e o cabeçalho de autorização configurado (valor mascarado), e o envelope abaixo no corpo. Eventos cujos dados ainda não foram definidos aparecem com `"dados": {}`; os exemplos completos dos eventos de nota virão com o contrato de emissão.

```bash
curl -X POST 'https://seu-endereco.exemplo/webhook' \
  -H 'Content-Type: application/json; charset=utf-8' \
  -H 'Notem-Evento: webhook.teste' \
  -H 'Notem-Evento-Id: evt_00000000000000000000000000000000' \
  -H 'Notem-Entrega-Id: whd_00000000000000000000000000000000' \
  -H 'Notem-Assinatura: t=1762344000,v1=ASSINATURA_ILUSTRATIVA' \
  -H 'Authorization: ••••••••' \
  --data-raw '{"id":"evt_00000000000000000000000000000000","tipo":"webhook.teste","criado_em":"2026-11-05T12:00:00.000Z","ambiente":"homologacao","organizacao_id":"...","integracao_id":"...","dados":{}}'
```

```powershell
curl.exe -X POST 'https://seu-endereco.exemplo/webhook' `
  -H 'Content-Type: application/json; charset=utf-8' `
  -H 'Notem-Evento: webhook.teste' `
  -H 'Notem-Assinatura: t=1762344000,v1=ASSINATURA_ILUSTRATIVA' `
  --data-raw '{\"id\":\"evt_...\",\"tipo\":\"webhook.teste\",\"dados\":{}}'
```

## 2. Formato da mensagem
`POST` para o endereço cadastrado, `Content-Type: application/json; charset=utf-8`:

```json
{
  "id": "evt_8f3c2a1b...",
  "tipo": "nota.autorizada",
  "criado_em": "2026-11-04T22:15:03-03:00",
  "ambiente": "homologacao",
  "organizacao_id": "UUID",
  "integracao_id": "UUID",
  "dados": { }
}
```

- `id`: identificador único do evento. **O mesmo evento pode ser entregue mais de uma vez** (reenvios); use o `id` para não processar duas vezes.
- `dados`: conteúdo específico do evento (documentado por tipo).
- A ordem de chegada **não é garantida**. Use `criado_em` e consulte a API se precisar do estado mais recente.

## 3. Cabeçalhos
| Cabeçalho | Conteúdo |
|---|---|
| `Notem-Evento` | o `tipo` do evento |
| `Notem-Evento-Id` | o `id` do evento |
| `Notem-Entrega-Id` | identificador desta tentativa de entrega |
| `Notem-Assinatura` | `t={timestamp},v1={assinatura}` |

## 4. Como validar que a mensagem veio da notem
Há duas formas, que podem ser usadas juntas:

- **Assinatura (recomendada):** sempre enviada em `Notem-Assinatura`. Prova a origem e que o corpo não foi alterado. Passos abaixo.
- **Chave de autorização (opção simples):** se cadastrada, chega no cabeçalho escolhido (ex.: `Authorization: Bearer minha-chave`). Basta comparar com o valor que você cadastrou. Não protege contra alteração do corpo; prefira a assinatura sempre que possível.
- **Confirmar pela API:** em caso de dúvida, trate o webhook apenas como aviso e consulte o estado atual pela API (`https://app.notemfiscal.com.br/api/v1`) com a sua chave de integração antes de agir.

### Validação da assinatura
1. Leia `t` e `v1` do cabeçalho `Notem-Assinatura`.
2. Monte o texto `{t}.{corpo_bruto}` — o corpo **exatamente como recebido**, antes de converter o JSON.
3. Calcule HMAC-SHA256 desse texto com o segredo `whsec_...`, em hexadecimal minúsculo.
4. Compare com `v1` usando comparação de tempo constante.
5. Recuse se `t` tiver mais de **5 minutos** de diferença do horário atual (proteção contra reenvio malicioso).

Durante a troca de segredo, a notem pode enviar duas assinaturas (`v1=...,v1=...`); aceite se qualquer uma for válida.

## 5. Resposta esperada e reenvios
- Responda **2xx em até 10 segundos**. Processe de forma assíncrona se precisar de mais tempo.
- Qualquer outra resposta, erro de conexão ou tempo esgotado é falha. A notem tenta novamente com intervalos crescentes: **1 min, 5 min, 30 min, 2 h, 6 h, 12 h e 24 h** (8 tentativas no total).
- **Envio de teste pelo painel:** o evento e a entrega são registrados primeiro; a notem faz uma tentativa direta (até 10 segundos) e mostra o resultado na tela (HTTP e tempo, ou o motivo). Se falhar, a entrega segue o mesmo cronograma de novas tentativas.
- **Eventos reais:** a primeira tentativa é feita em segundo plano logo após o evento; se isso não for possível, a entrega fica na fila e é enviada pelo processamento automático em até cerca de 1 minuto, sem perda.
- Depois de esgotadas as tentativas, a entrega fica como **falhou** e pode ser reenviada manualmente pelo painel.
- Se um endereço falhar continuamente por **3 dias**, ele é **desativado automaticamente** e a organização é avisada no painel.

## 6. Eventos
| Tipo | Quando |
|---|---|
| `webhook.teste` | Envio de teste pelo painel |
| `nota.autorizada` | Nota autorizada pelo governo (inclusive após "em verificação") |
| `nota.rejeitada` | Emissão rejeitada pelo governo |
| `nota.cancelada` | Cancelamento concluído |
| `nota.cancelamento_em_analise` | Cancelamento enviado para análise da prefeitura |
| `nota.cancelamento_indeferido` | Prefeitura indeferiu o cancelamento |
| `nota.substituida` | Nota substituída por outra |
| `nota.cancelada_prefeitura` | Prefeitura cancelou a nota por ofício |
| `nota.bloqueada_prefeitura` | Prefeitura bloqueou ações sobre a nota |
| `nota.manifestacao` | Tomador (ou outro ator) confirmou ou rejeitou a nota |
| `empresa.situacao_alterada` | Empresa ficou pronta ou deixou de estar pronta para emitir |
| `certificado.vencendo` | Certificado vence em 30, 15, 7 e 1 dia |
| `certificado.vencido` | Certificado venceu |
| `municipio.disponivel` | Município passou a ser atendido |

Os campos de `dados` de cada evento são documentados junto com a rota correspondente da API. Novos tipos podem ser adicionados sem aviso; ignore tipos que você não conhece.

## 7. Segurança
- Nunca confie no conteúdo sem validar a assinatura.
- O webhook **avisa**; para ações sensíveis, confirme o estado consultando a API.
- Mensagens nunca contêm certificados, senhas ou chaves.

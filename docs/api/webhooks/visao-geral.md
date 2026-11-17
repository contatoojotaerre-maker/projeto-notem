---
titulo: Visão geral
ordem: 1
atualizado: 2026-11-17
descricao: Avisos automáticos da notem para o seu sistema: cadastro, formato da mensagem e cabeçalhos.
---

# Visão geral

Webhooks são **avisos automáticos** que a notem envia ao sistema parceiro quando algo acontece (ex.: nota autorizada, cancelamento pela prefeitura, certificado vencendo). Assim o parceiro não precisa consultar a API o tempo todo.

O cadastro e gerenciamento de webhooks são feitos pelo painel; a API v1 não tem rotas de gerenciamento de webhooks.

## Cadastro
- Cada **integração** pode ter **endereços de webhook por ambiente** (homologação e produção), cadastrados no painel (Integrações → Webhooks).
- Para cada endereço o parceiro escolhe **quais eventos** quer receber.
- O endereço deve ser **HTTPS** e público. Endereços internos (localhost, IPs privados) são recusados.
- Ao criar o endereço, a notem gera um **segredo de assinatura** (`whsec_...`), exibido no cadastro. Depois ele fica **oculto**; o botão **Revelar** está disponível apenas para proprietário, administrador e desenvolvedor da organização, e cada revelação registra quem revelou e quando. O segredo pode ser trocado a qualquer momento.
- **Filtro por empresa (opcional):** o endereço pode receber eventos de apenas uma das empresas da organização. Vazio = todas. O `webhook.teste` é sempre entregue.
- No cadastro e no detalhe de cada endereço, o painel mostra o **exemplo do envio como comando curl** pronto, com botão copiar, nas versões Linux/macOS e PowerShell (`curl.exe`): POST para a URL cadastrada com `Content-Type`, `Notem-Evento`, `Notem-Evento-Id`, `Notem-Entrega-Id`, `Notem-Assinatura` (valor ilustrativo) e o cabeçalho de autorização configurado (valor mascarado), e o envelope abaixo no corpo. Os exemplos completos de `nota.autorizada` e `nota.rejeitada` estão abaixo.

```bash Linux/macOS
curl -X POST 'https://seu-endereco.exemplo/webhook' \
  -H 'Content-Type: application/json; charset=utf-8' \
  -H 'Notem-Evento: webhook.teste' \
  -H 'Notem-Evento-Id: evt_00000000000000000000000000000000' \
  -H 'Notem-Entrega-Id: whd_00000000000000000000000000000000' \
  -H 'Notem-Assinatura: t=1762344000,v1=ASSINATURA_ILUSTRATIVA' \
  -H 'Authorization: ••••••••' \
  --data-raw '{"id":"evt_00000000000000000000000000000000","tipo":"webhook.teste","criado_em":"2026-11-05T12:00:00.000Z","ambiente":"homologacao","organizacao_id":"...","integracao_id":"...","dados":{}}'
```

```powershell PowerShell
curl.exe -X POST 'https://seu-endereco.exemplo/webhook' `
  -H 'Content-Type: application/json; charset=utf-8' `
  -H 'Notem-Evento: webhook.teste' `
  -H 'Notem-Assinatura: t=1762344000,v1=ASSINATURA_ILUSTRATIVA' `
  --data-raw '{\"id\":\"evt_...\",\"tipo\":\"webhook.teste\",\"dados\":{}}'
```

## Formato da mensagem
`POST` para o endereço cadastrado, `Content-Type: application/json; charset=utf-8`:

```json
{
  "id": "evt_8f3c2a1b...",
  "tipo": "webhook.teste",
  "criado_em": "2026-11-04T22:15:03-03:00",
  "ambiente": "homologacao",
  "organizacao_id": "UUID",
  "integracao_id": "UUID",
  "dados": {}
}
```

- `id`: identificador único do evento. **O mesmo evento pode ser entregue mais de uma vez** (reenvios); use o `id` para não processar duas vezes.
- `dados`: conteúdo específico do evento (documentado por tipo).
- A ordem de chegada **não é garantida**. Use `criado_em` e consulte a API se precisar do estado mais recente.

## Cabeçalhos
| Cabeçalho | Conteúdo |
|---|---|
| `Notem-Evento` | o `tipo` do evento |
| `Notem-Evento-Id` | o `id` do evento |
| `Notem-Entrega-Id` | identificador desta tentativa de entrega |
| `Notem-Assinatura` | `t={timestamp},v1={assinatura}` |

Se uma chave de autorização foi cadastrada, ela também chega no cabeçalho escolhido. Veja [Chave de autorização](autorizacao.md).

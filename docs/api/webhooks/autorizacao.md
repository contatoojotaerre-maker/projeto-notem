---
titulo: Chave de autorização
ordem: 5
atualizado: 2026-11-17
descricao: Chave opcional enviada em um cabeçalho escolhido por você, além da assinatura.
---

# Chave de autorização

**Chave de autorização (opcional):** o parceiro pode informar um valor escolhido por ele e, opcionalmente, o nome do cabeçalho (padrão `Authorization`). Quando preenchida, a chave é enviada em todas as entregas, junto com a assinatura. Fica guardada cifrada e nunca aparece em registros. Não são aceitos nomes `Notem-*` nem cabeçalhos de protocolo (`Host`, `Content-Length`, `Content-Type`, `Transfer-Encoding`, `Connection`, `Cookie` etc.).

```http
POST /webhook HTTP/1.1
Content-Type: application/json; charset=utf-8
Notem-Evento: webhook.teste
Notem-Assinatura: t=1762344000,v1=ASSINATURA_ILUSTRATIVA
Authorization: Bearer minha-chave
```

> [!DICA]
> A chave de autorização é simples de conferir, mas não prova que o corpo não foi alterado. Use-a junto com a [assinatura](assinatura.md).

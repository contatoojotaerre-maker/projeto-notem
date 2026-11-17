---
titulo: Autenticação
ordem: 2
atualizado: 2026-11-17
descricao: Chaves de integração por ambiente, cabeçalho Authorization e troca de chaves sem interrupção.
---

# Autenticação

- Cada **integração** de uma organização tem **uma chave por ambiente**:
  - Homologação: começa com `ntm_homolog_`
  - Produção: começa com `ntm_prod_`
- Durante a troca, são permitidas até **duas chaves ativas por integração e ambiente**. Gere a nova, atualize o sistema parceiro e revogue a antiga.
- **Chaves não expiram**: valem até serem revogadas. A revogação tem efeito imediato. Não há revogação automática nem prazo.
- Ao criar uma organização, a notem cria automaticamente uma integração com o mesmo nome, sem chaves. Ela pode ser renomeada, e outras integrações podem ser criadas.
- Enviar em todas as chamadas: `Authorization: Bearer {chave}`.
- **O ambiente é definido pela chave**. Não existe parâmetro de ambiente: com a chave de homologação, tudo acontece em homologação (notas sem validade fiscal); com a de produção, em produção.
- A chave é exibida **uma única vez** ao ser criada. A notem guarda apenas uma impressão irreversível dela. Se perdida, gere outra e revogue a antiga.
- Uma integração opera **todas as empresas da sua organização** (não há seleção de empresas por integração). Empresa de outra organização responde `404 NAO_ENCONTRADO`.

## Testar a chave
Use `GET /status` para testar a chave: não consome nada e não acessa o governo. Chamadas sem chave recebem `401 AUTENTICACAO_INVALIDA` e `X-Request-Id`. Veja [Consultar status](op:consultarStatus).

```bash cURL
curl -i https://app.notemfiscal.com.br/api/v1/status \
  -H "Authorization: Bearer ntm_homolog_EXEMPLO0000000000000000"
```
```javascript JavaScript
const resposta = await fetch("https://app.notemfiscal.com.br/api/v1/status", {
  headers: { Authorization: `Bearer ${process.env.NOTEM_CHAVE}` },
});
```

> [!IMPORTANTE]
> A chave é um segredo do servidor. Nunca a coloque em código de navegador, aplicativo ou parâmetro de URL. A API não libera chamadas diretas de navegadores (sem CORS).

---
titulo: Primeiros passos
ordem: 1
atualizado: 2026-11-17
descricao: Da chave de homologação à primeira nota de teste, em sete passos.
---

# Primeiros passos

Este roteiro leva da criação da chave até a primeira nota emitida em **homologação** (sem validade fiscal). Cada passo aponta para a página com os detalhes.

```fluxo
Chave de homologação -> Empresa -> Configuração fiscal -> Certificado -> Serviço -> Situação -> Nota
```

## 1. Crie a chave de homologação
No painel da notem, abra **Integrações**, escolha a integração e gere uma chave de **homologação** (começa com `ntm_homolog_`). Ela aparece **uma única vez**: guarde-a no cofre de segredos do seu sistema. Veja [Autenticação](autenticacao.md).

## 2. Teste a chave
```bash cURL
curl https://app.notemfiscal.com.br/api/v1/status \
  -H "Authorization: Bearer ntm_homolog_EXEMPLO0000000000000000"
```
```javascript JavaScript
const resposta = await fetch("https://app.notemfiscal.com.br/api/v1/status", {
  headers: { Authorization: `Bearer ${process.env.NOTEM_CHAVE}` },
});
console.log(resposta.status, await resposta.json());
```
A resposta `200` informa o ambiente, a organização e a integração da chave. Veja [Consultar status](op:consultarStatus).

## 3. Cadastre a empresa emitente
`POST /empresas` com CNPJ, razão social e endereço. Guarde o `id` devolvido. Veja [Empresa e certificado](../guias/empresa-e-certificado.md).

## 4. Grave a configuração fiscal
`PUT /empresas/{id}/configuracao-fiscal` com a situação no Simples Nacional, o regime especial e os tributos aproximados. Veja [Configuração fiscal](../guias/configuracao-fiscal.md).

## 5. Envie o certificado A1
`POST /empresas/{id}/certificado` com o arquivo `.pfx` em base64 e a senha. O arquivo e a senha nunca são devolvidos.

## 6. Cadastre um serviço e confira a situação
`POST /empresas/{id}/servicos` com o código nacional do serviço. Depois, `GET /empresas/{id}/situacao`: quando `pronta_para_emitir` for `true`, a empresa pode emitir. Veja [Serviços e códigos](../guias/servicos-e-codigos.md) e [Municípios conveniados](../guias/municipios-conveniados.md).

## 7. Emita a nota de teste
`POST /notas` com uma `Idempotency-Key` gerada pelo seu sistema:

```bash cURL
curl -X POST https://app.notemfiscal.com.br/api/v1/notas \
  -H "Authorization: Bearer ntm_homolog_EXEMPLO0000000000000000" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 7d1f0a52-2c1e-4f7e-9a51-0c6a3b8e4d21" \
  -d '{"empresa_id":"00000000-0000-4000-8000-000000000201","servico_id":"00000000-0000-4000-8000-000000000301","valores":{"servico":"150.00"}}'
```
```javascript JavaScript
const resposta = await fetch("https://app.notemfiscal.com.br/api/v1/notas", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.NOTEM_CHAVE}`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({
    empresa_id: "00000000-0000-4000-8000-000000000201",
    servico_id: "00000000-0000-4000-8000-000000000301",
    valores: { servico: "150.00" },
  }),
});
```

- `201`: nota autorizada.
- `202`: a notem ainda está confirmando com o governo; o resultado chega por webhook ou pela consulta da nota.
- `422`: a nota não foi aceita; `erro.detalhes` diz o que corrigir.

> [!DICA]
> Se a conexão cair, repita o pedido com a **mesma** `Idempotency-Key`. A notem nunca emite uma segunda nota para a mesma chave. Veja [Idempotência](idempotencia.md).

## Próximos passos
- Receba os resultados por [webhooks](../webhooks/visao-geral.md).
- Entenda o [ciclo de vida da nota](../guias/ciclo-de-vida.md).
- Siga o [checklist de produção](checklist-producao.md) antes de usar a chave de produção.

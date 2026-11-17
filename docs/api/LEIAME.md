---
titulo: Documentação da API da notem
menu: Início
ordem: 0
atualizado: 2026-11-17
descricao: Integre seu sistema à notem para emitir, cancelar e consultar NFS-e do padrão nacional.
---

# Documentação da API da notem

A API da notem permite que o seu sistema emita, cancele, substitua e consulte **notas fiscais de serviço eletrônicas (NFS-e) do padrão nacional** em nome das empresas que você atende, sem que o cliente final precise acessar a notem.

```cartoes
- [Primeiros passos](primeiros-passos/primeiros-passos.md) Crie a chave, faça a primeira chamada e emita uma nota de teste.
- [Emissão de notas](guias/emissao.md) Como montar o pedido, o que a resposta significa e como reenviar com segurança.
- [Webhooks](webhooks/visao-geral.md) Receba avisos automáticos quando uma nota for autorizada, cancelada ou rejeitada.
- [Referência da API](referencia/introducao.md) Todas as 40 operações, com campos, respostas e exemplos.
```

## Como a API funciona

```fluxo
Seu sistema -> API da notem -> Governo (Sefin Nacional)
Seu sistema <- Webhooks da notem <- Governo (Sefin Nacional)
```

1. Seu sistema chama a API com a **chave da integração**. A chave define a organização e o ambiente (homologação ou produção).
2. A notem confere os dados, numera a DPS, assina com o certificado da empresa e envia ao governo.
3. O resultado volta na própria resposta (em geral em poucos segundos) e também por **webhook**.

## Por onde começar

- Leia [Primeiros passos](primeiros-passos/primeiros-passos.md) para fazer a primeira chamada.
- Entenda [Ambientes](primeiros-passos/ambientes.md): o cadastro das empresas é o mesmo em homologação e produção.
- Antes de ir para produção, siga o [Checklist de produção](primeiros-passos/checklist-producao.md).

## Endereços
Endereço oficial: `https://app.notemfiscal.com.br/api/v1`.

A especificação técnica completa (OpenAPI 3.1) pode ser baixada em [openapi.yaml](openapi.yaml).

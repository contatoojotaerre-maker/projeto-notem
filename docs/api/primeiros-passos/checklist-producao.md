---
titulo: Checklist de produção
ordem: 8
atualizado: 2026-11-17
descricao: O que conferir antes de trocar a chave de homologação pela de produção.
---

# Checklist de produção

Antes de usar a chave de produção (`ntm_prod_`), confira cada item:

## Chaves e segurança
- [ ] A chave de produção está guardada no cofre de segredos do servidor, nunca no código-fonte nem no navegador.
- [ ] O sistema registra o `X-Request-Id` de cada resposta, para informar ao suporte.
- [ ] Existe um procedimento para trocar a chave sem interrupção (duas chaves ativas durante a troca). Veja [Autenticação](autenticacao.md).

## Empresas
- [ ] `GET /empresas/{id}/situacao` com a chave de produção devolve `pronta_para_emitir: true`.
- [ ] O certificado A1 está válido e o sistema acompanha `certificado.vencendo`.
- [ ] A configuração fiscal foi conferida com o contador da empresa. Veja [Configuração fiscal](../guias/configuracao-fiscal.md).
- [ ] Os serviços têm classificação IBS/CBS completa (obrigatória a partir de 01/01/2027). Veja [IBS/CBS](../guias/ibs-cbs.md).

## Emissão
- [ ] Toda emissão, cancelamento e substituição envia uma `Idempotency-Key` própria e a reutiliza em reenvios. Veja [Idempotência](idempotencia.md).
- [ ] O sistema trata `202` (nota em verificação) sem reenviar com outra chave.
- [ ] As recusas `422` mostram ao usuário a `mensagem` de cada item de `erro.detalhes`.
- [ ] O sistema respeita `429` e o cabeçalho `Retry-After`. Veja [Limites de uso](limites.md).

## Webhooks
- [ ] O endereço de produção está cadastrado no painel, com HTTPS.
- [ ] A assinatura `Notem-Assinatura` é validada antes de usar o conteúdo. Veja [Assinatura](../webhooks/assinatura.md).
- [ ] O sistema responde `2xx` em até 10 segundos e ignora eventos repetidos pelo `id`.

> [!ATENCAO]
> O cadastro das empresas é o mesmo em homologação e produção. Depois de ir para produção, evite alterar empresas, serviços e certificados com a chave de homologação. Veja [Ambientes](ambientes.md).

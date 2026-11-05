# Documentação da API da notem — fonte oficial

Esta pasta é a **fonte da verdade** da API pública da notem. A página pública `/docs` será gerada a partir dela.

| Arquivo | Conteúdo |
|---|---|
| `convencoes.md` | Regras que valem para todas as rotas: autenticação, ambientes, formatos, erros, idempotência, paginação, versionamento |
| `glossario.md` | Termos e nomenclatura usados na API |
| `openapi.yaml` | Especificação técnica (OpenAPI 3.1), atualizada a cada rota criada |

## Regra de manutenção
Toda rota nova ou alterada da API deve atualizar `openapi.yaml` (e, se necessário, `convencoes.md` e `glossario.md`) **no mesmo trabalho** em que o código é alterado. Uma rota sem especificação é considerada incompleta.

## Endereços
Endereço oficial: `https://app.notemfiscal.com.br/api/v1`. Acesso externo sem sessão confirmado em `/status`, com resposta 401 JSON (`AUTENTICACAO_INVALIDA`) e `X-Request-Id` para chamada sem chave.

## Registro e retenção
Os registros são sanitizados, limitados a 64 KB por corpo e removidos automaticamente após 90 dias por tarefa SQL diária às 03:00 UTC. A gravação usa `waitUntil` quando disponibilizado pela requisição; caso contrário, é aguardada antes da resposta. O cabeçalho `Server-Timing` identifica o modo e, no modo síncrono, o tempo da gravação. `waitUntil` confirmado na publicação: resposta com `api-log;desc="background"` e registro correspondente confirmado no banco. Não há espera síncrona pela gravação no ambiente hospedado validado.

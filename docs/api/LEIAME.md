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
O domínio definitivo ainda não foi definido. Nos documentos, usa-se `https://{dominio}/api/v1`.

# Documentação da API da notem

Documentação oficial para integrar sistemas parceiros à API da notem.

| Arquivo | Conteúdo |
|---|---|
| `convencoes.md` | Regras que valem para todas as rotas: autenticação, ambientes, formatos, erros, idempotência, paginação, versionamento |
| `glossario.md` | Termos e nomenclatura usados na API |
| `openapi.yaml` | Especificação técnica das rotas e mensagens (OpenAPI 3.1) |
| `webhooks.md` | Contrato das mensagens, assinaturas e reenvios de webhooks |
| `empresas.md` | Cadastro, configuração fiscal, certificados e preparação de empresas |
| `notas.md` | Emissão e consulta da NFS-e, tomadores, rejeições e DANFSe em PDF |
| `cancelamento.md` | Cancelamento, análise fiscal do cancelamento e substituição de NFS-e |
| `sincronizacao.md` | Notas emitidas fora da notem, notas recebidas e situação da sincronização com o governo |
| `historico.md` | Histórico de alterações da API |

## Endereços
Endereço oficial: `https://app.notemfiscal.com.br/api/v1`.

Chaves de integração não expiram (valem até a revogação, que é imediata); até duas ativas por ambiente para troca sem interrupção. Cada nova organização recebe uma integração padrão com o mesmo nome, sem chaves. Use `/status` para testar a chave. Chamadas sem chave recebem `401 AUTENTICACAO_INVALIDA` e `X-Request-Id`.

## Registro e retenção
Os registros de chamadas têm dados sensíveis removidos ou mascarados e são mantidos por 90 dias.

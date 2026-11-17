# Documentação pública (docs.notemfiscal.com.br) — funcionamento e migração

## Como funciona
- Fonte única: `docs/api/**/*.md` + `docs/api/openapi.yaml`. `docs/interno/` nunca é lido (teste `src/test/docs-site.test.ts`).
- Montagem: `src/docs-site/build.ts` (plugin Vite → módulo `virtual:notem-docs`) gera páginas, menu, busca (`/busca.json`), `llms.txt`, `sitemap.xml`. Tabelas geradas: limites (`src/lib/api-policy.ts`), rejeições (`src/lib/rejection-guidance.ts`, mesma base da tela do painel) e lista de operações.
- Atendimento: `src/lib/hosts.ts` decide pelo endereço; `src/server.ts` chama `src/docs-site/handler.server.ts` antes do app. HTML puro + `/_recursos/docs.js`; sem sessão, sem banco, sem chaves.
- Cabeçalho de cada Markdown: `titulo`, `menu` (opcional), `ordem`, `atualizado` (AAAA-MM-DD), `descricao`.
- Recursos: avisos `> [!DICA]`/`[!ATENCAO]`/`[!IMPORTANTE]`; blocos ```` ```cartoes ````, ```` ```fluxo ````; blocos de código consecutivos com rótulo (```` ```bash cURL ```` + ```` ```javascript JavaScript ````) viram abas; link `op:operationId` aponta para a página da operação.
- Referência: cada operação do `openapi.yaml` precisa de `tags`, `operationId`, `x-titulo` e exemplos (`components/examples`) válidos — `src/test/validate-openapi-examples.py`.
- Dados reais: `src/test/real-data-fingerprints.json` guarda só SHA-256; atualizar com `src/test/real-data-fingerprints.database.sql` quando houver dados reais novos.

## Domínios
| Endereço | Resultado |
|---|---|
| `docs.notemfiscal.com.br/*` | documentação; `/entrar`, `/esqueci-senha`, `/definir-senha`, `/redefinir-senha`, `/o/*`, `/admin*`, `/conta*`, `/dashboard*` → 301 app.; `/api` e `/api/*` (qualquer método) → 404 em JSON no formato de erro da API (`NAO_ENCONTRADO`, mensagem apontando `https://app.notemfiscal.com.br/api/v1`, `X-Request-Id`, `no-store`, noindex), sem redirecionar; `/_serverFn/*` → "Página não encontrada" (404); `/docs/*` → 301 sem o prefixo |
| `app.notemfiscal.com.br/docs*` | 301 para docs. (mesmo caminho) |
| `app.notemfiscal.com.br/*` | painel e API, com `X-Robots-Tag: noindex, nofollow`; `robots.txt` bloqueia tudo |
| `notemfiscal.com.br`, `www.`, `notem-waiting-garden.lovable.app` | 301 para app. (mesmo caminho e consulta) |
| prévia do editor / localhost | como antes; documentação em `/docs` (sem indexação) |

Os redirecionamentos feitos pelo site só valem depois que `app.notemfiscal.com.br` deixar de ser o "domínio principal" no Lovable.

## Trecho antigo → arquivo novo (17/11/2026)
| Trecho antigo | Arquivo novo |
|---|---|
| LEIAME.md (índice de arquivos) | `LEIAME.md` reescrito como página inicial (a lista de arquivos virou o menu) |
| LEIAME.md › Endereços (chaves, `/status`, 401) | `primeiros-passos/autenticacao.md` |
| LEIAME.md › Registro e retenção | `primeiros-passos/requisicoes.md` |
| convencoes §1, §3, §4, §4.1, §5, §8, §11 | `primeiros-passos/requisicoes.md` |
| convencoes §2 (chaves, ambiente pela chave) | `primeiros-passos/autenticacao.md` |
| convencoes §2 "cadastro compartilhado" | `primeiros-passos/ambientes.md` (aviso destacado) |
| convencoes §6 | `primeiros-passos/erros.md` |
| convencoes §7 | `primeiros-passos/idempotencia.md` |
| convencoes §9 | `primeiros-passos/limites.md` (tabela gerada dos limites reais) |
| convencoes §10 | `webhooks/visao-geral.md` e `webhooks/eventos.md` (frases repetidas removidas) |
| glossario.md | `primeiros-passos/glossario.md` |
| empresas › Regras gerais, §1, §3 | `guias/empresa-e-certificado.md` (linha de ambientes → `primeiros-passos/ambientes.md`) |
| empresas §2 | `guias/configuracao-fiscal.md` |
| empresas §4 (sem IBS/CBS) e §6 | `guias/servicos-e-codigos.md` |
| empresas §4 › IBS/CBS do serviço | `guias/ibs-cbs.md` |
| empresas §5 | `guias/municipios-conveniados.md` |
| empresas §7 (exemplo `empresa.situacao_alterada`) | removido por repetição: já está completo em `webhooks/eventos.md` |
| notas › Regras gerais, §1, §3, §4, DANFSe, E0014, confirmação automática | `guias/emissao.md` |
| notas › CNPJ alfanumérico (regras gerais) | `guias/cnpj-alfanumerico.md` |
| notas §2 | `guias/ciclo-de-vida.md` |
| notas §5 | `webhooks/eventos.md` (Eventos de notas) |
| notas §6 "Emissão com grupo IBS/CBS não aceita" | removido: desatualizado desde a Parte 3 (IBS/CBS já é enviado) |
| notas › Orientações Anexo I (tabela) | `referencia/rejeicoes-do-governo.md` (tabela gerada da mesma base do painel) |
| notas › IBS/CBS na emissão | `guias/ibs-cbs.md` |
| cancelamento › Regras gerais, §1, §2, §4 | `guias/cancelamento.md` |
| cancelamento §3 | `guias/substituicao.md` |
| cancelamento §5 (tabela) | `referencia/rejeicoes-do-governo.md` (gerada) |
| sincronizacao.md | `guias/notas-recebidas.md` |
| webhooks §1 (sem chave de autorização), §2, §3 | `webhooks/visao-geral.md` |
| webhooks §1 › Chave de autorização | `webhooks/autorizacao.md` |
| webhooks §4 | `webhooks/assinatura.md` (+ exemplo em JavaScript) |
| webhooks §5, §7 | `webhooks/entregas.md` |
| webhooks §6, Assinatura por grupo, exemplos completos | `webhooks/eventos.md` |
| — | novos: `primeiros-passos/primeiros-passos.md`, `primeiros-passos/checklist-producao.md`, `guias/conceitos.md`, `guias/leiaute-nt009.md`, `referencia/introducao.md` |

Textos reescritos na mudança: referências "ver `x.md` seção N" viraram links; "owner, admin, developer e administrador da plataforma" (revelar segredo) → "proprietário, administrador e desenvolvedor da organização"; "ou, futuramente, pela API" removido do cadastro de webhooks; exemplos com CNPJ de tomador inválido (`99888777000166`) → `99888777000100`, e-mail → `@exemplo.com.br`, município → Florianópolis (4205407).

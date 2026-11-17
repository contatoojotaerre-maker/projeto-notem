# Documentação pública em docs.notemfiscal.com.br

## Decisões já tomadas
- Referência: **uma página por operação (40 operações em 30 endereços)**.
- docs/api/: **um arquivo por página**, em pastas por seção (`primeiros-passos/`, `guias/`, `webhooks/`, `referencia/`); `openapi.yaml` e `historico.md` ficam onde estão. Texto **movido, nunca duplicado**. Nome do arquivo = endereço da página.
- Termos internos nas mensagens: **corrigir na fonte**, mantendo `codigo` e `campo`.
- Endereço do painel aberto pelo docs: **redireciona para app.** (mesmo caminho). `/api/...` no docs: não encontrada.

## 1. Domínio e separação
- Um único site atende dois domínios, separados pelo endereço de acesso:
  - **docs.**: toda página vira página da documentação. Painel (`/entrar`, `/o/...`, `/admin`, `/conta`, `/dashboard`, senha) → redireciona 301 para `app.` no mesmo caminho. `/api/...` e funções internas do painel → não encontrada (bloqueio no servidor, antes de qualquer tela).
  - **app.**: `/docs` e subpáginas → 301 para `https://docs.notemfiscal.com.br/...` com o mesmo caminho.
  - **notemfiscal.com.br** e **www**: 301 para `app.` (hoje isso é feito pelo "domínio principal"; ver passo a passo).
  - Na prévia do Lovable, a documentação fica em `/docs/...` para você conferir antes de publicar.
- `src/lib/app-url.ts` ganha `DOCS_URL` e `DOCS_HOST`; o link "Documentação da API" do "?" do painel passa a usar `DOCS_URL`.
- A documentação não carrega a sessão do painel nem fala com o banco. Hoje a estrutura comum de todas as páginas carrega o cliente de login; ela passa a carregá-lo só fora da documentação. Teste no navegador confirma: nenhuma chamada ao banco e nenhuma chave nas páginas do docs.
- Cabeçalhos no docs: política de conteúdo restritiva (só scripts/estilos do próprio site e a fonte da marca, sem formulários externos, sem molduras), HSTS, sem cookies (removidos se aparecerem), cache público curto.
- Indexação: docs liberado (robots.txt e sitemap.xml próprios). **Achado:** hoje o painel *não* está bloqueado para buscadores (robots.txt libera tudo). Proposta: `app.` passa a responder `noindex` e robots.txt com bloqueio. Confirme.

## 2. Fonte única do conteúdo
- Na montagem do site, um leitor lê **só** `docs/api/**/*.md` e `docs/api/openapi.yaml` e gera páginas, sumário, menu, índice de busca e `llms.txt`. Nada copiado para o código das telas.
- Cada arquivo tem um cabeçalho curto: título, posição no menu e data da última atualização (o rodapé mostra essa data).
- Recursos no Markdown: avisos (`> [!DICA]`, `> [!ATENCAO]`, `> [!IMPORTANTE]`), cartões, abas cURL/JavaScript, diagramas simples desenhados em caixas (sem biblioteca externa). Links entre páginas são links relativos para os `.md` — funcionam no GitHub e no site.
- Tabela de rejeições do governo: gerada da mesma base da tela "Mensagens de rejeição" (separada num módulo próprio, sem mudar o painel).

## 3. Estrutura do menu e arquivos
Origem entre parênteses; "novo" = texto novo, conferido no código.

**Início** — `LEIAME.md` (reescrito como página inicial: cartões, "Como a API funciona", "Por onde começar").

**Primeiros passos** (`primeiros-passos/`)
- `primeiros-passos.md` (novo) · `autenticacao.md` (convencoes §2) · `ambientes.md` (convencoes §2 cadastro compartilhado + novo, com aviso destacado) · `requisicoes.md` (convencoes §1, §3–5, §8) · `limites.md` (convencoes §9; números conferidos com os limites reais por teste) · `erros.md` (convencoes §6) · `idempotencia.md` (convencoes §7 + notas "reenvio seguro"/E0014) · `checklist-producao.md` (novo) · `glossario.md` (movido).

**Guias** (`guias/`)
- `conceitos.md` (novo) · `empresa-e-certificado.md` (empresas §1, §3) · `configuracao-fiscal.md` (empresas §2) · `servicos-e-codigos.md` (empresas §4, §6) · `emissao.md` (notas §1, §3–4, DANFSe) · `ciclo-de-vida.md` (notas §2 situações + novo diagrama) · `cancelamento.md` (cancelamento §1–2, §4–5) · `substituicao.md` (cancelamento §3) · `municipios-conveniados.md` (empresas §5) · `ibs-cbs.md` (empresas/notas IBS/CBS) · `notas-recebidas.md` (sincronizacao.md) · `cnpj-alfanumerico.md` (novo) · `leiaute-nt009.md` (novo).

**Webhooks** (`webhooks/`)
- `visao-geral.md` · `eventos.md` · `assinatura.md` (+ validação em JavaScript) · `entregas.md` · `autorizacao.md` — todos de webhooks.md.

**Referência da API** (`referencia/`)
- `introducao.md` e `rejeicoes-do-governo.md` (texto curto + tabela gerada, com busca).
- 40 páginas geradas do `openapi.yaml` (endereço `/referencia/{grupo}/{operacao}`), em 11 grupos: Status · Empresas · Configuração fiscal · Certificado · Serviços · Tomadores · Situação da empresa · Sincronização · Notas · Notas recebidas · Catálogos. Cada uma: método e URL, descrição, parâmetros, corpo com todos os campos (tipo, obrigatório, formato, limites, valores), respostas por status, erros da rota, exemplos cURL/JavaScript e resposta na coluna direita fixa.
- Link para baixar `openapi.yaml`.

**Histórico de mudanças** — `historico.md`.

Removidos depois de movidos: `convencoes.md`, `empresas.md`, `notas.md`, `cancelamento.md`, `sincronizacao.md`, `webhooks.md`, `glossario.md` (raiz). Atualizo tudo que aponta para eles: testes, AGENTS.md, `docs/interno/`, descrições do `openapi.yaml`, regras guardadas do projeto.
- Na revisão, retiro do texto público o que é detalhe interno (ex.: "matriz de empresas.md… sem reescrita automática", quem pode revelar segredo no painel fica descrito sem nomes internos).

## 4. openapi.yaml (sem mudar o contrato)
Hoje: nenhuma operação tem exemplo de resposta; só 1 tem exemplo de corpo; 26 não têm descrição. Acrescento:
- exemplos de corpo e de resposta (sucesso e erro principal) nas 40 operações, tirados do formato real das respostas no código;
- descrições faltantes; grupos (tags) nos 11 nomes acima;
- referências a arquivos antigos trocadas por links do docs.
Teste: cada exemplo é validado contra o esquema da própria resposta. Listo tudo no relatório.

## 5. Termos internos nas mensagens
- E0714 ("…assinatura no transmissor…") e E0855 ("…o administrador da plataforma precisa antecipá-la…") reescritas para o parceiro.
- Varredura completa: orientações de rejeição, mensagens de erro da API e textos de webhooks (transmissor, administrador da plataforma, Supabase, service_role, nomes de tabelas/funções). Corrijo do mesmo jeito.
- Registro em `historico.md` como melhoria de texto; retrato das mensagens atualizado; teste que falha se um termo interno aparecer numa mensagem.
- Relatório com texto antigo → novo de cada uma.

## 6. Layout
- Topo: marca notem (→ início), busca (atalho "/"), "Painel" (→ app.), tema claro/escuro (escuro padrão, salvo no navegador).
- Esquerda: menu por seções (gaveta no celular). Centro: conteúdo. Direita: "Nesta página"; na Referência, os exemplos fixos ao rolar.
- Blocos de código com copiar e abas cURL/JavaScript; realce de sintaxe feito na montagem.
- Rodapé: anterior/próxima e data de atualização. Página "não encontrada" própria.
- Cores, fonte (Plus Jakarta Sans) e logos da notem; 375 px e computador.
- Busca local (índice gerado na montagem, carregado só ao abrir a busca): títulos, textos e rotas.
- `llms.txt` na raiz do docs listando todas as páginas.

## 7. Testes
- `docs/interno/` ausente das páginas, do índice de busca e do `llms.txt`.
- Nenhuma página com termos proibidos.
- 40 operações com página, exemplo de requisição (cURL e JavaScript) e de resposta; exemplos válidos pelo esquema.
- Nenhum link interno quebrado (inclui âncoras).
- Limites da página iguais aos reais.
- Separação de domínios: docs não serve painel nem API; painel redireciona; `app./docs` redireciona; raiz e www → app.
- Nenhum texto perdido ou repetido na mudança de arquivos (comparação automática antigo × novo, base da tabela do relatório).
- OpenAPI 3.1 válido; testes atuais passando; matriz de isolamento sem mudança.

## 8. Passo a passo do domínio (você executa; nenhuma chave no chat)
Hoje `app.` é o **domínio principal**: todo outro domínio é desviado para ele, inclusive um docs novo. Por isso a ordem importa:
1. **Lovable** → Project Settings → Domains → **Connect Domain** → `docs.notemfiscal.com.br`. Anote os dois registros mostrados.
2. **Cloudflare** → zona notemfiscal.com.br → DNS → Add record:
   - Tipo **A**, nome `docs`, conteúdo `185.158.133.1`, proxy **DNS only** (nuvem cinza), igual ao `app`.
   - Tipo **TXT**, nome `_lovable.docs`, conteúdo `lovable_verify=…` exatamente como o Lovable mostrar.
3. Esperar o domínio ficar **Active** no Lovable (enquanto isso, ele cai no painel; sem risco).
4. Eu publico a versão nova (só com sua aprovação).
5. **Lovable** → Domains → menu "⋯" de `app.notemfiscal.com.br` → **Unset as primary**. A partir daí os redirecionamentos (raiz/www → app., docs ↔ app.) passam a ser feitos pelo próprio site.
6. Eu confiro de fora: docs abre, `app./docs` redireciona, raiz/www → app., cabeçalhos e indexação.

## 9. Fora do escopo
`transmissor/`, regras fiscais, contrato da API (só textos de mensagens e exemplos/descrições do openapi), painel além do link do "?", do redirecionamento de `/docs` e do bloqueio de indexação (se aprovado). Sem publicar antes da sua aprovação.

## 10. Relatório final
Menu final; páginas novas/alteradas; tabela trecho antigo → arquivo novo; acréscimos do openapi; mensagens antigo → novo; prints (início, um guia, uma página da referência; claro/escuro; computador/celular); verificado e não verificado.

## Detalhes técnicos
- Roteamento por domínio com o recurso de reescrita de endereço do roteador: no host docs o caminho `/x` é tratado internamente como `/docs/x` (servidor e navegador); assets passam direto. Redirecionamentos e bloqueios (`/api`, `/_serverFn`) ficam em `src/server.ts`, numa função pura testada.
- Leitor do conteúdo como plugin de montagem (módulo virtual), usando `js-yaml` (já instalado) e um leitor de Markdown só na montagem; busca com índice JSON pequeno.
- `rejectionGuidance` vai para um módulo próprio reexportado por `invoices.ts`.
- AGENTS.md: regra de domínio/roteamento e de fonte única do docs.

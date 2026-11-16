# notem — Correções e reorganização do painel (plano das duas partes)

Ordem: Parte 1 → relatório → sua aprovação → Parte 2 → relatório. Nada é publicado sem sua aprovação. Nada muda em `transmissor/`, regras fiscais, DPS, emissão, cancelamento, lógica da sincronização, permissões ou RLS. O contrato `/api/v1` e os webhooks ficam idênticos.

## Parte 1 — Defeitos (sem mudar a estrutura, sem migração)

1. **Telas de erro em português, dentro do painel com menu.** Três telas: "Página não encontrada" + "Voltar ao Início"; "Você não tem acesso a esta página. Fale com o proprietário ou administrador da organização." + "Voltar ao Início"; "Não foi possível carregar esta página." + "Tentar de novo" + "Voltar ao Início". Empresa, nota, integração ou organização inexistente ou de outra organização → "não encontrada" (nunca confirma que existe). Equipe/Organização/Administração sem papel → "sem acesso". Nenhum texto interno aparece. A tela cheia de último recurso (quando nem o painel carrega) e a página de erro do servidor também passam ao português.
2. **Login volta ao endereço pedido.** Ao mandar para `/entrar`, o destino vai junto (`?destino=`) e fica guardado na aba do navegador para sobreviver ao retorno do Google e à definição de senha do convite. Só aceita caminhos internos: começa com `/`, sem `//`, sem `\`, sem protocolo, sem caracteres de controle; qualquer outro vira o destino padrão. As URLs de retorno do serviço de login não mudam.
3. **Menu entre 768 e 900 px:** o botão de abrir aparece em toda largura em que o menu fica escondido. Conferência em 375, 768, 820, 900 e 1280 px.
4. **Detalhe da nota legível:** um único conjunto de rótulos para nota da notem e nota de fora ("Base de cálculo", "Alíquota do ISS", "Valor líquido", "ISS retido"…), datas `dd/mm/aaaa hh:mm`, tomador "Pessoa jurídica / Pessoa física / Estrangeiro", endereço em linhas. O mesmo na aba Tomadores.
5. **Datas em Brasília em todas as telas** pelo módulo único da Fase 8 (sincronização, chaves, chamadas, entregas, histórico da nota, equipe, convites, certificados, rodapés).
6. **Códigos fixos em `?aba=`:** empresa `resumo` (hoje "Pronta para emitir"), `cadastro` ("Dados"), `fiscal`, `servicos`, `certificado`, `tomadores`, `recebidas`, `sincronizacao`; integração `chaves`, `webhooks`, `chamadas`, `configuracoes`, `como-testar` (`requisicoes` → `chamadas`). Nomes antigos (com ou sem acento, qualquer caixa) são convertidos e o endereço é reescrito. Alertas, Início e Ajuda geram só os códigos novos. Os rótulos das abas não mudam nesta parte.
7. **Filtros no endereço:** Notas (busca, empresa, situação, origem, período por, de, até, página), Empresas (busca com espera de 0,35 s, situação, página) e Requisições (de, até, ambiente, situação, empresa, somente erros, página). Voltar do detalhe mantém os filtros. Valores inválidos no endereço são ignorados.
8. **Atalhos do Início:** "Chamadas com erro" abre Requisições com "Somente erros", últimas 24 horas e o ambiente atual; "Webhooks falhando" abre a sub-aba do ambiente atual.
9. **Restos:** retirar "Buscar na notem"; webhook "Todas as empresas"; "Empresa não autorizada" → "Empresa não encontrada nesta organização"; sai a coluna "Empresas" da lista de integrações.
10. **Sem códigos internos:** "Criada por {nome}" e "Última alteração: Painel — {nome}" ou "API — integração {nome}"; município "Passo de Torres/SC"; CNPJ com máscara (inclusive alfanumérico); "Regime especial: Nenhum" (pelo nome).
11. **PDF em um clique:** "Baixar PDF" já entrega o arquivo. Na nota da notem, "Baixar PDF" e "Baixar XML" juntos, no mesmo lugar da nota de fora.
12. **Pequenos ajustes:** painel da conta fecha ao clicar fora e com Esc; "Recolher menu" lembrado no navegador (falha de armazenamento é ignorada); janela de cancelamento com "Voltar" e "Confirmar cancelamento"; "Verificar município"; Ajuda usa "Ver sugestão da tabela oficial" e "Usar"; Notas vazia diferencia "Ainda não há notas neste ambiente." de "Nenhuma nota com estes filtros." + "Limpar filtros".

**Testes da Parte 1:** destino do login (`//site.com`, `https://…`, `/\site.com`, `javascript:`, `%2F%2F`, tabulação/quebra de linha, vazio, válidos); conversão de todos os `?aba=` antigos; leitura dos filtros do endereço; datas em Brasília; rótulos da nota e do tomador; máscara de CNPJ. Suíte atual, tipos, montagem, OpenAPI 3.1 e matriz (1.558) continuam passando.

## Parte 2 — Reorganização

**2.1 Menu (6 itens):** Início · Notas (Emitidas · Recebidas) · Empresas · Alertas (contador) · Integrações · Organização (Dados · Equipe; só Prop, Adm, AP). `/ajuda` → Início; `/equipe` → `/organizacao?aba=equipe`.

**2.2 Notas › Recebidas:** notas em que uma empresa da organização é tomadora ou intermediária, com a mesma busca, filtros (empresa, situação, período), planilha e ZIP, a mesma prova de posse e coluna Prestador. Detalhe em tela própria (`/o/{org}/notas/recebidas/{id}`), sem cancelar; "Atualizar com o governo", PDF e XML como hoje. A aba da empresa sai; o endereço antigo leva a Recebidas filtrada pela empresa. Detalhe da nota ganha link para a empresa.

**2.3 Empresa:** cabeçalho "Empresas › {razão social}", CNPJ, Ativa/Inativa, Desativar/Reativar, "Ver notas desta empresa". Aba **Resumo** (substitui "Pronta para emitir"): situação, o que falta com o botão que resolve (ou "Peça a um proprietário ou administrador"), validade do certificado, última sincronização do ambiente atual, serviços ativos, "Verificar município" e resposta do governo em "Detalhes técnicos". Demais abas: Cadastro, Configuração fiscal, Serviços, Certificado, Tomadores, Sincronização.

**2.4 Integração:** "Integrações › {nome}"; abas Chaves, Webhooks, Chamadas, Configurações, Como testar.

**2.5 Organização:** Dados (nome; tipo só leitura; "Identificador no painel") e Equipe (tabela atual, sem ações novas).

**2.6 Topo e telas gerais:** botão "?" com a janela pequena (frase da emissão pela API, documentação oculta até existir, suporte por e-mail e `wa.me`, ocultos se vazios); Ajuda e passo a passo removidos, orientações no Resumo e nos estados vazios; **Minha conta** (nome editável, e-mail só leitura, trocar senha com a senha atual e, se o serviço de login exigir, código de confirmação por e-mail; contas que entram só com Google recebem "definir senha" pelo e-mail de recuperação; tema; Sair); marca → Início da organização atual; `/dashboard` vai direto ao Início quando há uma única organização (lista para várias ou AP); trocar de organização mantém a seção (detalhe → lista da seção); Administração esconde as 4 telas "em breve" (endereços → Organizações) e ganha ícones próprios para Suporte e Organizações.

**2.7 Regra única de ambiente:** seguem o seletor Início, Notas (Emitidas e Recebidas), Alertas (incluindo o histórico de falhas de webhook), Chaves (só o ambiente atual), Webhooks (sem sub-abas), Chamadas (sem filtro de ambiente), Sincronização (só o cartão atual) e situação "Pronta para emitir". Cadastro, Configuração fiscal, Serviços, Certificado, Tomadores e Organização mostram "Cadastro compartilhado entre produção e homologação." Faixa em produção "Produção — notas com validade fiscal" e homologação como hoje, sempre visível no celular. Confirmações dizem o ambiente ("Gerar chave de **produção**?") ao gerar/revogar chave, criar/alterar webhook e reenviar entrega. Aviso de cadastro alterado pela homologação continua igual.

**2.8 Glossário** aplicado no painel, mensagens e trechos de `docs/api/` que citam o painel (inclui "Esgotada" em `webhooks.md`). Títulos do navegador = título da página ("Empresa · Group Jota"), um único "voltar" (caminho clicável), páginas de 50 com "Página N de M" em todas as listas.

**2.9 Redirecionamentos:** `ajuda`, `equipe`, `modelos-de-servico`, abas antigas da empresa (inclusive `recebidas`) e da integração, telas "em breve" de `/admin/` — com teste para cada um.

**2.10 Documentação:** `docs/interno/mapa-do-painel.md` com a estrutura nova; trechos de `docs/api/` e descrições do `openapi.yaml` que citam telas, sem mudar o contrato.

**Testes da Parte 2:** todos os redirecionamentos; regra de ambiente por tela da lista; Recebidas com a mesma prova de posse (empresa sem certificado não vê; outra organização 404); matriz de isolamento ampliada com as consultas de Recebidas e o resumo da empresa; suíte atual passando.

## Migração (só na Parte 2) — justificativa

Recebidas em toda a organização com busca, planilha e ZIP exige que a lista, a contagem e a revalidação do ZIP usem a mesma função do banco das Emitidas (regra do projeto: listas e exportações nunca divergem). A migração:
- acrescenta o sentido "recebidas" à função de filtros das notas (prova de posse avaliada nas regras de acesso de quem consulta, como já é hoje), com busca por número, nome/CNPJ do prestador e chave de acesso;
- cria os índices necessários (conferidos com EXPLAIN) e revoga/concede permissões como as demais funções.
Não altera tabelas, permissões, RLS nem regras fiscais.

## Detalhes técnicos

- Erros: componentes `PanelNotFound` / `PanelForbidden` / `PanelError` como `notFoundComponent`/`errorComponent` das rotas filhas de `_authenticated` (renderizam no `<Outlet />` do AppShell); loaders lançam `notFound()` e um erro de acesso tipado; `defaultErrorComponent`/`defaultNotFoundComponent` do roteador e `__root` em português; `src/lib/error-page.ts` traduzido.
- Destino do login: módulo único `safeInternalPath()`; `_authenticated/route.tsx` recebe só o acréscimo do `search: { destino }` no `redirect` (mudança mínima justificada no layout gerenciado).
- Notas ganha rota própria (`notas/index.tsx`) com `validateSearch`; Empresas e Integração ganham `validateSearch` com os códigos de aba e filtros; mapa de nomes antigos → códigos em um módulo testado (`panel-tabs.ts`), usado também por `alerts.ts`.
- Nomes de autores: função do servidor que confere a participação na organização antes de ler os nomes dos membros (padrão já usado nas chaves).
- Parte 2: `noteFilters` ganha `direction`; CSV e ZIP passam o mesmo campo; nova função do servidor para o detalhe da recebida resolve a empresa pela prova de posse; histórico de webhooks e chamadas recebem o ambiente; `updatePreferences` aceita o nome.
- AGENTS.md: atualizar as regras de telas/rotas do painel e de destino do login.

## Não verificado

Telas com login não podem ser abertas no navegador de teste (o login deste projeto é gerenciado fora da Lovable); serão conferidas pelo código e por testes, e marcadas como não verificadas no relatório.

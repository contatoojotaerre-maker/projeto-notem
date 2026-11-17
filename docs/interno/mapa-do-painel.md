# Mapa do painel (levantamento, somente leitura)


> **Atualização (Parte 2 da reorganização, 17/11/2026).** As seções 1 a 8 abaixo descrevem o painel **antes** da reorganização e ficam como registro. O painel atual é o resumido aqui.

## 0. Painel atual (depois da Parte 2)

**Menu:** Início · Notas (Emitidas, Recebidas) · Empresas · Integrações · Alertas · Organização (Dados, Equipe — só proprietário, administrador e AP). A marca leva ao Início da organização atual. Topo: seletor de ambiente, botão "?" (frase da API e suporte por e-mail/WhatsApp, ocultos se vazios), tema e conta (Minha conta, Sair). Faixa de ambiente sempre visível, também em produção ("Produção — notas com validade fiscal").

| Endereço | Tela |
|---|---|
| `/o/{org}/inicio` | Início |
| `/o/{org}/notas` | Notas › Emitidas (notem e emitidas fora da notem), filtros no endereço, CSV/ZIP |
| `/o/{org}/notas/{id}` | Detalhe de nota emitida |
| `/o/{org}/notas/recebidas` | Notas › Recebidas (empresa da organização como tomadora ou intermediária, com prova de posse do CNPJ), mesmos filtros (sem origem), CSV próprio (prestador, CNPJ do prestador, papel) e ZIP |
| `/o/{org}/notas/recebidas/{id}` | Detalhe de nota recebida, só leitura (atualizar com o governo, PDF, XML). Rota própria: nunca é tratada como `/notas/{id}`; id inválido ou de outra organização → "Página não encontrada" |
| `/o/{org}/empresas/{id}` | Empresa: "Empresas › {nome}", CNPJ, Ativa/Inativa, "Ver notas desta empresa"; abas Resumo (padrão), Cadastro, Configuração fiscal, Serviços, Certificado, Tomadores, Sincronização |
| `/o/{org}/integracoes/{id}` | Integração: "Integrações › {nome}"; abas Chaves, Webhooks, Chamadas, Configurações, Como testar |
| `/o/{org}/alertas` | Alertas e histórico de falhas de webhook do ambiente atual |
| `/o/{org}/organizacao` | Organização › Dados (nome; tipo só leitura; "Identificador no painel") e `?aba=equipe` |
| `/conta` | Minha conta: nome (2 a 80 caracteres), e-mail só leitura, trocar senha (senha atual conferida no servidor, regra única de senha, encerra as outras sessões e mantém a atual), "Definir senha" por e-mail para quem entra só com Google, tema, Sair |

**Regra única de ambiente.** Seguem o seletor: Início, Notas (Emitidas e Recebidas), Alertas (com o histórico de falhas de webhook), Chaves, Webhooks (sem sub-abas), Chamadas (sem filtro de ambiente; `?ambiente=` antigo é descartado), Sincronização (só o cartão do ambiente atual) e o Resumo da empresa. Mostram "Cadastro compartilhado entre produção e homologação.": Cadastro, Configuração fiscal, Serviços, Certificado, Tomadores e Organização. Confirmações dizem o ambiente: gerar/revogar chave, criar/editar/ativar/desativar/excluir endereço de webhook, trocar segredo e reenviar entrega.

**Redirecionamentos.** `/o/{org}/ajuda` e `/o/{org}/modelos-de-servico` → Início; `/o/{org}/equipe` → Organização › Equipe; aba antiga "Notas recebidas" da empresa → Notas › Recebidas filtrada pela empresa; abas antigas da empresa e da integração (`requisicoes` → `chamadas`); telas "em breve" de `/admin/` → Organizações; `/dashboard` com uma única organização (sem ser AP) → Início. Trocar de organização mantém a seção (detalhe → lista); seção não permitida ao papel na nova organização → Início.

**Listas:** 50 por página com "Página N de M" (notas, empresas, tomadores, chamadas, entregas de webhook).

**Testes:** `panel-nav.test.ts` (redirecionamentos e troca de organização), `panel-routes-notfound.test.ts` (id inválido nas duas páginas de nota, aba antiga da empresa), `app-routing.test.tsx` (rotas de Recebidas e Minha conta), `account.test.ts` (nome e senha), `password-rule.test.ts` (regra única de senha e mensagens do serviço de login), `panel-tabs.test.ts`, `list-search.test.ts`; `isolation-matrix.database.sql` cobre `list_org_notes`/`org_notes_count` com `_direction='recebidas'`.

Data do levantamento: 16/11/2026. Fonte: leitura do código atual (rotas em `src/routes/`, telas em `src/components/notem/`, regras em `src/lib/`, permissões nas funções do servidor e nas políticas das migrações).

**Como foi verificado**
- Telas sem login: abertas no navegador de teste (computador 1280 px e celular 390 px). Títulos e redirecionamentos conferidos.
- Telas com login: **não verificadas na tela**. A pré-visualização não entra na conta (o banco é gerenciado fora da Lovable). Tudo o que está abaixo sobre essas telas vem do código.
- Este documento descreve o que existe e os problemas. Não traz proposta de reorganização.

Abreviações dos papéis: **Prop** = proprietário · **Adm** = administrador · **Op** = operador · **Dev** = desenvolvedor · **Leit** = leitura · **AP** = administrador da plataforma (pode entrar em qualquer organização, mesmo sem ser membro).

---

## 1. Elementos gerais

### 1.1 Menu lateral

Ordem atual (organização):

| # | Item | Ícone | Endereço | Contador | Quem vê no menu |
|---|---|---|---|---|---|
| 1 | Início | casa | `/o/{org}/inicio` | — | todos |
| 2 | Notas | folha | `/o/{org}/notas` | — | todos |
| 3 | Empresas | prédio | `/o/{org}/empresas` | — | todos |
| 4 | Alertas | sino | `/o/{org}/alertas` | número vermelho com o total de alertas da organização no ambiente atual (acima de 99 mostra "99+") | todos |
| 5 | Integrações | código | `/o/{org}/integracoes` | — | todos |
| 6 | Equipe | pessoas | `/o/{org}/equipe` | — | Prop, Adm, AP |
| 7 | Organização | engrenagem | `/o/{org}/organizacao` | — | Prop, Adm, AP |
| 8 | Ajuda | ponto de interrogação | `/o/{org}/ajuda` | — | todos |

Grupo **Administração** (só AP), abaixo de uma linha:

| # | Item | Ícone | Endereço | Situação |
|---|---|---|---|---|
| 1 | Organizações | prédio (o mesmo de Empresas) | `/admin/organizacoes` | funciona |
| 2 | Empresas e notas | folha (o mesmo de Notas) | `/admin/empresas-e-notas` | **"Disponível em breve"** |
| 3 | Municípios | marcador de mapa | `/admin/municipios` | **"Disponível em breve"** |
| 4 | Mensagens de rejeição | balão | `/admin/mensagens-de-rejeicao` | só tabela de leitura |
| 5 | Leiaute fiscal | arquivo de código | `/admin/leiaute-fiscal` | funciona |
| 6 | Saúde do sistema | atividade | `/admin/saude-do-sistema` | **"Disponível em breve"** |
| 7 | Suporte | ponto de interrogação (o mesmo de Ajuda) | `/admin/suporte` | funciona |
| 8 | Cobrança | cartão | `/admin/cobranca` | **"Disponível em breve"** |

Outros detalhes do menu:
- No topo do menu fica a marca notem, que leva a `/dashboard` (a tela "Olá, …"), e não ao Início da organização.
- Acima dos itens aparece, em letras pequenas, o nome da organização atual (ou "Seu espaço" se não houver nenhuma).
- Sem organização (por exemplo, convite ainda não aceito), o menu mostra só "Início" → `/dashboard`.
- No rodapé: texto "notem · NFS-e nacional" e o botão "Recolher menu". Recolhido, o menu mostra só os ícones e o ícone da marca. A escolha não é guardada (volta aberto ao recarregar).
- Item ativo: destacado quando o endereço contém a seção (por exemplo, o detalhe de uma nota mantém "Notas" ativo).

### 1.2 Barra do topo

Da esquerda para a direita:
1. Botão de abrir o menu (só em telas estreitas).
2. Ícone de prédio + **seletor de organização** (lista suspensa). Trocar de organização sempre leva ao **Início** da nova organização (perde a tela em que o usuário estava). Para o AP, a lista mostra **todas** as organizações da plataforma.
3. **Seletor de ambiente**: "Produção" / "Homologação". A escolha é guardada no perfil do usuário (vale para todas as abas e aparelhos dele). Não muda de tela.
4. Campo **"Buscar na notem"** — **desativado** (aparece, mas não funciona). Some em telas estreitas.
5. Botão de tema (sol/lua) — claro/escuro, guardado no perfil.
6. Botão redondo com a inicial do usuário → painel com nome, e-mail e "Sair". O painel não fecha ao clicar fora (só clicando de novo no botão). Não existe página de perfil, troca de nome ou troca de senha com o usuário logado.

### 1.3 Avisos globais

| Aviso | Onde | Quando | Texto |
|---|---|---|---|
| Faixa de homologação | topo de todas as telas com login, fixa ao rolar | ambiente = Homologação | "Ambiente de homologação — notas sem validade fiscal" |
| Convite pendente | faixa abaixo do topo | convite que exige aceite explícito (conta já existente) | "Você foi convidado para a organização X" + botão "Aceitar convite" |
| Cadastro alterado pela chave de homologação | acima do conteúdo em **todas** as telas da organização (não aparece em `/dashboard` nem em Administração), nos dois ambientes | alteração de cadastro feita por chave de homologação nos últimos 30 dias e ainda não marcada como lida | título "Cadastro alterado pela chave de homologação", até 5 itens + "e mais N alteração(ões)". Botão "Marcar como lido" só para Prop, Adm, AP |
| Contador de alertas | item Alertas do menu | sempre que houver alertas | número |

**Como o usuário sabe o ambiente:** pelo seletor do topo; pela faixa (só em homologação — em produção não há marca além do seletor); e por textos soltos: subtítulo do Início ("Produção"/"Homologação"), frase da tela Alertas, aba "Pronta para emitir", subtítulo do detalhe da nota e da aba "Notas recebidas".

### 1.4 Tela inicial geral ("Olá, …") — `/dashboard`

- Título da aba do navegador: "Início". Título na página: "Olá, {primeiro nome}." (ou "Olá.").
- Mostra: "Suas organizações" e um cartão por organização com o botão "Abrir organização". Sem organizações: "Você ainda não participa de nenhuma organização."
- Para o AP: cartões de todas as organizações + botão "Gerenciar organizações" (→ `/admin/organizacoes`).
- Quando aparece: **sempre depois de entrar** (login com senha, Google, definição de senha do convite) e ao clicar na marca notem. Mesmo vindo de um link para outra tela, o login sempre termina aqui.
- O menu lateral, nesta tela, já mostra os itens da última organização usada (nenhum fica destacado).

### 1.5 Celular e telas estreitas

- Abaixo de 900 px o menu lateral fica escondido. O botão de abrir o menu só aparece abaixo de 768 px. **Entre 768 e 900 px não há como abrir o menu** (pelo código; não verificado na tela).
- Menu aberto no celular: cobre a tela com fundo escurecido; fecha ao tocar fora, no "X" ou ao escolher um item.
- Seletor de organização limitado a 145 px abaixo de 640 px; busca do topo escondida abaixo de 900 px.
- Tabelas: rolam para o lado dentro de uma caixa (Notas, Empresas, Integrações, Requisições, Entregas, Equipe, Organizações). Histórico de certificados e lista de serviços usam tabela simples com rolagem.
- Abas da empresa: 8 botões numa linha com rolagem lateral. Abas da integração: quebram em várias linhas.
- Formulários: duas colunas viram uma abaixo de 640 px.

### 1.6 Carregando e erro (geral)

- **Carregando:** não há tela nem indicador geral de carregamento. Só a aba Certificado e o bloco de município mostram "Carregando…". Nas demais, a tela espera os dados. O efeito ao trocar filtros não foi verificado na tela.
- **Página inexistente** (`/qualquer-coisa`): "404 · Página não encontrada · A página que você procura não existe ou foi movida." + "Voltar ao início" (leva a `/` → `/entrar` → `/dashboard` se logado). Verificado no navegador.
- **Erro ou acesso recusado** (por exemplo: abrir Equipe sendo Op, abrir `/admin/...` sem ser AP, uma empresa ou integração inexistente, uma organização que não é sua, uma conta sem nenhuma organização): tela cheia **em inglês**, sem menu: "This page didn't load · Something went wrong on our end… · Try again · Go home". A mensagem em português que o servidor envia ("Acesso não autorizado.", "Página não encontrada.", "Integração não encontrada.") não é mostrada.

---

## 2. Telas sem login

| Tela | Endereço | Título do navegador | Título na página | Conteúdo / ações | Observações |
|---|---|---|---|---|---|
| Raiz | `/` | — | — | redireciona para `/entrar` | verificado |
| Entrar | `/entrar` | "Entrar · notem" | "Acesse sua conta" · "Bem-vindo de volta." | E-mail, Senha (mostrar/ocultar), "Lembrar de mim", "Esqueceu a senha?", "Entrar", "Entrar com Google", "Acesso exclusivo para usuários convidados." | Se já estiver logado, vai direto a `/dashboard`. Erro: "E-mail ou senha inválidos. O acesso é permitido apenas por convite." |
| Esqueci a senha | `/esqueci-senha` | "Recuperar acesso" | "Esqueceu a senha?" | E-mail, "Enviar link", "Voltar para entrar" | Resposta: "Se este e-mail tiver acesso à notem, você receberá um link…" |
| Definir senha (convite) | `/definir-senha` | "Aceitar convite" | "Defina sua senha" | Nova senha, Confirme a senha, lista de requisitos ao vivo, "Salvar senha" (só ativo com todos cumpridos e confirmação igual) | Sem link válido: "Este link é inválido ou expirou. Solicite um novo e-mail." |
| Redefinir senha | `/redefinir-senha` | "Nova senha" | "Redefina sua senha" | igual ao anterior | link vindo do e-mail de recuperação |
| Qualquer tela com login | `/dashboard`, `/o/...`, `/admin/...` | — | — | sem sessão → `/entrar` | **o endereço pedido é perdido**: depois de entrar, vai sempre para `/dashboard` (verificado o redirecionamento) |

---

## 3. Área da organização

### 3.1 Matriz geral de acesso (organização)

✓ = vê e usa · L = vê, mas só leitura · ✗ = não vê · ⚠ = observação

| Tela / ação | Prop | Adm | Op | Dev | Leit | AP |
|---|---|---|---|---|---|---|
| Início | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Início › bloco "Integração (últimas 24 horas)" | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ |
| Início › "Cadastrar empresa" (lista vazia) | ✓ | ✓ | ✗ ⚠ | ✗ | ✗ | ✓ |
| Notas (lista, filtros, planilha, ZIP) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nota › Baixar XML/PDF | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nota › Cancelar / Substituir / Solicitar análise | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Nota › Atualizar com o governo | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Empresas (lista) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nova empresa / editar Dados / Desativar-Reativar | ✓ | ✓ | ✓ | L | L | ✓ |
| Configuração fiscal, Serviços, Certificado (alterar) | ✓ | ✓ | L ⚠ | L | L | ✓ |
| Série DPS (opções avançadas) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Pronta para emitir › Verificar município | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Sincronização › Sincronizar | ✓ | ✓ | L | L | L | ✓ |
| Notas recebidas › Atualizar com o governo | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Tomadores | L | L | L | L | L | L |
| Alertas | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Aviso de homologação › Marcar como lido | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Integrações (lista e detalhe) | ✓ | ✓ | L | ✓ | L | ✓ |
| Integração › criar, editar, chaves, webhooks | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ |
| Integração › Requisições (conteúdo) | ✓ | ✓ | ✗ ⚠ | ✓ | ✗ ⚠ | ✓ |
| Integração › Webhooks (ver endereços e entregas) | ✓ | ✓ | L | ✓ | L | ✓ |
| Equipe | ✓ | ✓ | ✗ ⚠ | ✗ ⚠ | ✗ ⚠ | ✓ |
| Organização (renomear) | ✓ | ✓ | ✗ ⚠ | ✗ ⚠ | ✗ ⚠ | ✓ |
| Ajuda | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

⚠ explicados:
- **Op cadastra empresa, mas não consegue deixá-la pronta**: pode criar e editar Dados, mas não pode configurar a parte fiscal, os serviços nem o certificado. E o botão "Cadastrar empresa" do Início vazio não aparece para ele, embora "Nova empresa" apareça em Empresas.
- **Requisições para Op e Leit**: a aba aparece, mas sempre vazia, com o texto "Os registros de requisições aparecem somente para proprietário, administrador e desenvolvedor."
- **Equipe e Organização** somem do menu para Op, Dev e Leit; pelo endereço direto, o acesso é recusado com a tela de erro em inglês.
- Webhooks: Op e Leit veem os endereços, as entregas e as respostas recebidas (só leitura).

### 3.2 Início — `/o/{org}/inicio`

- Menu: Início · Título do navegador: "Início" · Título na página: **nome da organização** (difere do menu), com o subtítulo "Produção"/"Homologação".
- Muda com o ambiente: sim (notas, alertas, integração).
- Seções, nesta ordem:
  1. **Empresas** — quadros clicáveis: Total · Prontas para emitir · Com pendência · Inativas → Empresas com o filtro no endereço (`?situacao=prontas|pendencia|inativas`). **Não depende do ambiente** (cadastro compartilhado).
  2. **Notas** — botões de período: "Mês atual" (padrão), "Mês anterior", "Últimos 30 dias". Quadros (não clicáveis): Emitidas · Canceladas · Rejeitadas pelo governo. Cada um com a variação em relação ao período anterior e, quando houver, "+N emitidas/canceladas fora da notem". Nota de rodapé explicando o período (data de emissão, horário de Brasília).
  3. **Integração (últimas 24 horas)** — só Prop, Adm, Dev, AP. Sem integração: "Nenhuma integração criada" + "Ir para Integrações". Com integração: Chamadas à API · Chamadas com erro (dica ao passar o mouse: 4xx/5xx) · Webhooks falhando. Com uma única integração, os quadros levam direto à aba Requisições/Webhooks dela; com várias, levam à lista de Integrações.
  4. **Alertas** — linha "2 impeditivos · 3 de atenção · …" ou "Tudo em dia", + "Ver alertas".
- Vazio (organização sem empresas): só o título e "Nenhuma empresa cadastrada · Cadastre a primeira empresa…" + "Cadastrar empresa" (Prop, Adm, AP).

### 3.3 Notas — `/o/{org}/notas`

- Menu: Notas · Título: "Notas" (igual). Muda com o ambiente: sim.
- Lista única com as notas emitidas pela notem e as emitidas fora da notem (com prova de posse). Notas **recebidas** não entram aqui (ficam na empresa).
- Filtros, nesta ordem: Buscar ("Número da nota, nome ou CPF/CNPJ do tomador, chave de acesso"; espera 0,35 s depois de digitar) · Empresa · Situação (Processando, Em verificação, Autorizada, Rejeitada, Cancelamento em análise, Cancelada, Substituída, Cancelada pela prefeitura) · Origem (Emitidas pela notem / fora da notem) · Período por (Data de emissão / Competência) · De · Até · atalhos "Mês atual / Mês anterior / Últimos 30 dias" + "Limpar".
- Os filtros **não ficam no endereço**: voltar do detalhe da nota apaga tudo.
- Contagem: "N nota(s) no filtro".
- Exportações (todos os papéis): **"Exportar planilha"** (CSV, até 10.000) e **"Baixar XML/PDF"** → janela "Baixar arquivos das notas": XML oficial / PDF (DANFSe), limite de 500, barra de progresso, "Cancelar" (interrompe), "Fechar", "Gerar ZIP".
- Tabela: NFS-e (número ou "Aguardando número"; selo "Emitida fora da notem"; id externo) · Empresa / tomador · Situação · Valor do serviço · Emissão. Páginas de 50 ("Página N").
- Vazio: "Nenhuma nota encontrada." (o mesmo texto para "não há notas" e "o filtro não achou nada"; sem orientação).

### 3.4 Detalhe da nota — `/o/{org}/notas/{id}`

- Sem item próprio no menu (Notas fica ativo). Título do navegador: "Detalhe e histórico da NFS-e" · Título na página: "NFS-e {número}" ou "Nota em acompanhamento".
- Subtítulo: situação · ambiente. Ligações "Substitui a nota anterior" / "Ver nota substituta".
- **Emitida pela notem**, nesta ordem: botão "Baixar PDF" (fica **acima** do botão de voltar; depois de preparado vira "Salvar PDF" e precisa de um segundo clique) · "← Notas" · "Atualizar com o governo" (Prop, Adm, Op, AP) · "Baixar XML" · aviso de operação pendente · botões "Cancelar nota", "Substituir nota", "Solicitar análise da prefeitura" (Prop, Adm, Op, AP; só nota autorizada sem pendência) · Resumo · Serviço · Tomador · Valores · IBS/CBS · Histórico · Motivos da rejeição · Cancelamento · Eventos registrados no governo · "Detalhes técnicos" (chave de acesso, identificador DPS, DPS sem assinatura, DPS assinada, XML da NFS-e, XML dos eventos).
- Janelas: "Cancelar nota" (Motivo, Justificativa com contador, caixa "Esta ação tem efeito fiscal", "Voltar", "Cancelar nota"); "Solicitar análise fiscal do cancelamento"; "Substituir nota" (motivo, serviço, justificativa, descrição, competência bloqueada, município, valor, retenção, descontos, tomador, informações complementares; "Emitir nota substituta").
- **Emitida fora da notem**: "← Notas", "Atualizar com o governo", "Baixar PDF", "Baixar XML", texto explicando que se cancela no sistema emissor ou no Portal Nacional, Resumo, Tomador, Valores, IBS/CBS, Cancelamento, Eventos, Detalhes técnicos. Os rótulos dos valores são diferentes dos da nota emitida pela notem (ver problemas).
- Não há ligação para a empresa da nota.

### 3.5 Alertas — `/o/{org}/alertas`

- Menu: Alertas (com contador) · Título: "Alertas" (igual). Muda com o ambiente: sim (texto "O que precisa de atenção em produção/homologação. Os alertas somem sozinhos quando o problema é resolvido.").
- Filtros: Gravidade (Todas / Impeditivo / Atenção / Informativo) · Empresa.
- Cada linha: selo de gravidade, empresa, data, mensagem e a ligação para resolver:
  - certificado vencido/vencendo → "Abrir Certificado" (empresa, aba Certificado);
  - classificação IBS/CBS → "Abrir Serviços";
  - empresa sem condição de emitir → "Abrir Pronta para emitir";
  - erro na sincronização → "Abrir Sincronização";
  - nota em verificação há mais de 30 min / cancelamento aguardando há mais de 24 h → "Abrir nota";
  - falha de webhook → "Abrir integração".
- Vazio: "Tudo em dia" ou "Nenhum alerta com estes filtros."
- Abaixo, fechado por padrão: "Histórico de falhas de webhook (90 dias)" — mostra os **dois ambientes** misturados, cada item com o ambiente.

### 3.6 Equipe — `/o/{org}/equipe`

- Prop, Adm, AP. Título: "Equipe".
- Tabela: Usuário (nome e e-mail) · Papel · Desde.
- **Nenhuma ação**: não é possível convidar, mudar papel nem remover. Convites só existem em Administração › Organizações ("primeiro membro"); convites adicionais respondem "Convites adicionais estarão disponíveis em uma próxima fase."

### 3.7 Organização — `/o/{org}/organizacao`

- Prop, Adm, AP. Título: "Organização".
- Campos: Nome (editável) · "Endereço" (o identificador da organização no endereço do painel, só leitura). Botão "Salvar alterações".
- O tipo da organização não aparece.

### 3.8 Ajuda — `/o/{org}/ajuda`

- Todos. Título: "Ajuda".
- "Passo a passo" com 8 itens e ligações: Cadastrar empresa ("Abrir" → Nova empresa) · Enviar certificado ("Abrir Empresas") · Configurar a parte fiscal ("Abrir Empresas") · Configurar serviço ("Abrir Empresas") · Sincronizar notas ("Abrir Empresas") · Cancelar nota ("Abrir Notas") · Criar integração e chave de API ("Abrir Integrações") · Cadastrar webhook ("Abrir Integrações").
- "Documentação da API": escondida até existir o endereço público.
- "Suporte": e-mail e WhatsApp, quando cadastrados em Administração › Suporte. Sem contato, a seção não aparece.
- O passo a passo é igual para todos os papéis, inclusive para quem não pode executar o passo.

### 3.9 Telas "em breve" e endereço antigo

- `/o/{org}/modelos-de-servico` redireciona para o Início (endereço antigo, mantido).
- Na organização não há mais telas "em breve" (o componente "Disponível em breve" só é alcançado nas quatro telas de Administração).

---

## 4. Área da empresa

### 4.1 Empresas (lista) — `/o/{org}/empresas`

- Menu: Empresas · Título: "Empresas" + contagem ("N empresas cadastradas", "N empresas prontas para emitir"…).
- Ações: "Nova empresa" (Prop, Adm, Op, AP).
- Filtros: busca "Buscar por CNPJ ou nome" (consulta a cada tecla) · botões de situação "Todas / Prontas para emitir / Com pendência / Inativas" (no endereço `?situacao=`; a busca e a página não ficam no endereço).
- Tabela: Empresa (razão social + nome fantasia) · CNPJ · UF · Situação (selo "Pronta para emitir" / "Com pendência" / "Inativa") · seta. Páginas de 30 (só o número).
- A situação "pronta" usa o ambiente atual do topo.
- Vazio: "Nenhuma empresa cadastrada" ou "Nenhuma empresa encontrada" (sem botão).

### 4.2 Nova empresa — `/o/{org}/empresas/nova`

- Sem item de menu (Empresas ativo). Título: "Nova empresa". Botão de voltar só com ícone (seta).
- Acesso pelo endereço: Prop, Adm, Op, AP; outros recebem a tela de erro em inglês.
- Formulário: "Identificação e contato" (CNPJ, Razão social, Nome fantasia, Inscrição municipal, E-mail, Telefone) · "Endereço" (CEP, Logradouro, Número, Complemento, Bairro, Município com busca, UF automática) · "Salvar empresa". Ao salvar, abre o detalhe da empresa.

### 4.3 Detalhe da empresa — `/o/{org}/empresas/{id}`

- Título do navegador: "Dados e configuração fiscal da empresa" (o mesmo para todas as abas) · Título na página: **razão social** + selo "Ativa"/"Desativada" + botão "Desativar"/"Reativar" (Prop, Adm, Op, AP) + linha "Alterado via API — integração X · id externo Y" quando for o caso + nome fantasia.
- Voltar: botão só com ícone (seta) → lista de Empresas.
- Abas (nesta ordem; a aba pode vir no endereço `?aba=` usando **o nome exibido**, por exemplo `?aba=Pronta%20para%20emitir`):

| # | Aba | Conteúdo | Ações e quem pode | Ambiente |
|---|---|---|---|---|
| 1 | **Dados** | formulário da empresa (igual a Nova empresa); rodapé com datas de criação/alteração, "Origem: Painel · Criador: {código} · Último editor: {código}" | Salvar empresa: Prop, Adm, Op, AP; demais só leitura. CNPJ travado depois de certificado ou série DPS (com aviso) | não muda |
| 2 | **Configuração fiscal** | resumo em texto; aviso de configuração incompleta (com botão de correção); perguntas: Simples Nacional (Não / MEI / ME ou EPP), Como o ISS é recolhido, Como o IBS/CBS será apurado, Percentual aproximado de tributos, Alíquota do ISS no Simples; "Opções avançadas" (regime especial, não informar tributos, percentuais por esfera, canhoto no DANFSe, série DPS só para AP, "Regime especial: código N"); rodapé com série, data e "Detalhes técnicos › Editor: {código}" | Salvar configuração: Prop, Adm, AP | não muda |
| 3 | **Certificado** | certificado ativo (titular, CNPJ, emissor, validade, selo de situação) ou "Nenhum certificado enviado para esta empresa."; histórico | "Enviar certificado"/"Substituir certificado" → arquivo .pfx/.p12 até 100 KB + senha → "Enviar": Prop, Adm, AP | não muda |
| 4 | **Serviços** | tabela: Nome · Serviço nacional · IBS/CBS (Completa / Pendente / A revisar) · Situação · lápis. Editor: nome e ativo, serviço do catálogo, descrição, tributação do ISS, retenção, IBS/CBS ("Ver sugestão da tabela oficial", "Usar"), NBS, classificação, indicador de operação, consumidor final, atividade do Simples, "Opções avançadas" | "Novo serviço", "Salvar serviço": Prop, Adm, AP; demais veem (lápis = "Ver") | não muda |
| 5 | **Tomadores** | lista expansível (nome, documento, todos os campos, identificação externa, data) — os tomadores vêm da API; 50 por página | nenhuma ação | não muda |
| 6 | **Notas recebidas** | notas em que a empresa é tomadora/intermediária, vindas da sincronização; filtro de situação; cada nota abre na própria lista (não em tela própria) com resumo, "Atualizar com o governo", "Baixar PDF", "Baixar XML" | Atualizar: Prop, Adm, Op, AP; baixar: todos | muda |
| 7 | **Pronta para emitir** | "Pronta para emitir" / "Ainda não está pronta para emitir", itens (Empresa ativa, Certificado válido, Configuração fiscal, Serviço ativo, Classificação IBS/CBS, Município) com OK / Pendente / Não verificado; avisos; bloco "Município atendido pelo emissor nacional" com resposta literal do governo e "Detalhes técnicos" | "Verificar"/"Verificar novamente" (1 vez por minuto, contagem regressiva): Prop, Adm, AP | muda |
| 8 | **Sincronização** | texto explicativo; **um cartão por ambiente, os dois sempre visíveis** (não segue o seletor do topo): situação, último NSU, última consulta, próxima consulta permitida, documentos importados, primeira sincronização, andamento, último erro, verificação diária | escolher "Novidades desde a última sincronização" (após a primeira) ou "Últimos 1/3/6/12/24 meses" + "Sincronizar" (com espera "Aguarde m:ss"): Prop, Adm, AP. Sem certificado: "Cadastre o certificado digital desta empresa para sincronizar." Outros papéis: "Somente proprietário e administrador da organização podem sincronizar." | os dois juntos |

- Estados vazios: Certificado e Tomadores têm texto; Serviços "Nenhum perfil de serviço cadastrado."; Notas recebidas "Nenhuma nota recebida. Sincronize a empresa para trazer as notas do governo."
- Não há ligação "ver as notas desta empresa".

---

## 5. Integrações

### 5.1 Integrações (lista) — `/o/{org}/integracoes`

- Menu: Integrações · Título: "Integrações" (igual).
- Ação: "Nova integração" (Prop, Adm, Dev, AP) → janela com Nome, Descrição, "Integração ativa", texto "Esta integração opera todas as empresas da organização.", "Criar integração" → abre o detalhe.
- Tabela: Nome · Situação (Ativa/Inativa) · Empresas (**sempre "Todas"**, texto fixo) · Último uso · Homologação (N ativas / N revogadas) · Produção (idem) · seta.
- Vazio: "Nenhuma integração cadastrada" (sem orientação). Toda organização nova já recebe uma integração sem chaves.

### 5.2 Detalhe da integração — `/o/{org}/integracoes/{id}`

- Título do navegador: "Integração e webhooks" · Título na página: **nome da integração** + selo Ativa/Inativa. Voltar: ligação de texto "Integrações" (acima do título).
- Abas (nesta ordem; o endereço aceita `?aba=requisicoes` e `?aba=webhooks`):

| # | Aba | Conteúdo | Ações e quem pode | Ambiente |
|---|---|---|---|---|
| 1 | **Chaves** (padrão) | duas colunas, **Homologação e Produção lado a lado**; cada chave: identificação (prefixo), "Mais recente"/"Mais antiga", criada, último uso, "Sem expiração — vale até ser revogada"; "Chaves revogadas (N)" fechado | "Gerar chave"/"Gerar nova chave" (até 2 ativas), "Revogar" (com confirmação): Prop, Adm, Dev, AP. A chave completa aparece **uma única vez** na janela "Chave gerada" com botão de copiar e "Já guardei a chave" | os dois juntos |
| 2 | **Dados** | o mesmo formulário da criação (nome, descrição, ativa) | "Salvar alterações": Prop, Adm, Dev, AP | não muda |
| 3 | **Webhooks** | sub-abas **Homologação** (padrão, mesmo em produção) / Produção. "Endereços": URL, descrição, eventos, último sucesso, segredo de assinatura (Revelar/Copiar/Ocultar), empresa, chave de autorização, segredo anterior, motivo de desativação, "Exemplo do envio (curl)", selo Ativo/Desativado/Com falhas. "Entregas": filtro por endereço, "Somente falhas", "Atualizar", tabela Evento · Data · Tentativa (n/8) · Situação (Pendente/Sucesso/Falhou/Esgotada) · HTTP · Duração · Resposta · "Detalhes"/"Reenviar"; 20 por página | "Adicionar endereço", "Editar", "Desativar/Ativar", "Trocar segredo", "Enviar teste", "Excluir", "Revelar", "Reenviar" (esgotadas): Prop, Adm, Dev, AP. Op e Leit veem tudo, sem botões | por sub-aba |
| 4 | **Requisições** | filtros De · Até · ambiente (padrão "Todos os ambientes") · status (lista fixa de códigos) · empresa · "Somente erros"; tabela Data · Ambiente · Método e rota · Status · Duração · "Detalhes" (janela "Requisição" com identificador, corpo enviado e resposta em JSON); 30 por página | só consulta: Prop, Adm, Dev, AP. Op/Leit: vazio com aviso | filtro próprio |
| 5 | **Como testar** | comando curl de `/status` com botão copiar; prefixos das chaves ativas; exemplo de validação da assinatura do webhook | copiar | — |

- Janela de endereço de webhook ("Adicionar endereço"/"Editar endereço"): URL HTTPS, Descrição, Empresa (uma, ou "Todas as empresas autorizadas"), grupos de eventos / "Personalizar eventos", aviso de que `webhook.teste` é sempre incluído, Autorização opcional (Cabeçalho, Chave), exemplo do envio, "Cancelar"/"Salvar".

---

## 6. Administração (só AP)

| Tela | Endereço | Título do navegador | Título na página | Conteúdo / ações |
|---|---|---|---|---|
| Organizações | `/admin/organizacoes` | "Administração · Organizações" | "Administração" (pequeno) + "Organizações" | "Nova organização" (Nome + Tipo: "Sistema parceiro" / "Empresa ou grupo"; aviso se o nome repetir). Filtro "Tipo". Tabela Organização · Tipo · Endereço · Criada em · ações (envelope "Convidar primeiro membro" → E-mail + Papel → "Enviar convite"; seta "Abrir"). Seção "Convites pendentes" (vale 7 dias; "Vencido"; "Revogar"). Vazios: "Nenhuma organização cadastrada", "Nenhuma organização deste tipo", "Nenhum convite pendente." |
| Empresas e notas | `/admin/empresas-e-notas` | "Administração · Empresas e notas" | "Empresas e notas" | **"Disponível em breve"** |
| Municípios | `/admin/municipios` | idem | "Municípios" | **"Disponível em breve"** |
| Mensagens de rejeição | `/admin/mensagens-de-rejeicao` | idem | "Mensagens de rejeição" | tabela Código · Campo · Orientação (só leitura) |
| Leiaute fiscal | `/admin/leiaute-fiscal` | idem | "Administração" + "Leiaute fiscal" | tabela de leiaute vigente por ambiente; tabela IBS/CBS / próximo leiaute; "Início do leiaute NT 009 em produção" (data e hora + Salvar + confirmação); "IBS/CBS e próximo leiaute" (4 campos, cada um com Salvar e confirmação) |
| Saúde do sistema | `/admin/saude-do-sistema` | idem | "Saúde do sistema" | **"Disponível em breve"** |
| Suporte | `/admin/suporte` | idem | "Suporte" | E-mail e WhatsApp (só números, com 55) exibidos na Ajuda; "Salvar" |
| Cobrança | `/admin/cobranca` | idem | "Cobrança" | **"Disponível em breve"** |

- Ambiente: só Leiaute fiscal mostra os dois ambientes; o seletor do topo não altera nada aqui.
- Para abrir uma organização, o AP usa o seletor do topo, os cartões de `/dashboard` ou a seta da tabela.
- Só Organizações e Leiaute fiscal mostram "Administração" acima do título.

---

## 7. Problemas encontrados (sem correção)

### 7.1 Nomes inconsistentes para a mesma coisa

| # | Tema | Onde e exemplo |
|---|---|---|
| N1 | "Situação" × "Pronta para emitir" | A aba da empresa chama-se "Pronta para emitir"; a coluna da lista chama-se "Situação"; o Início diz "Prontas para emitir"; a API e a documentação dizem `/situacao` e "Situação da empresa". "Situação" também é usado para a nota, a integração (Ativa/Inativa), a sincronização e o cancelamento. |
| N2 | Ativa × Desativada × Inativa | Empresa: selo "Desativada", botão "Desativar/Reativar", mas lista e Início dizem "Inativa(s)". Integração: "Ativa/Inativa" por uma caixa "Integração ativa" dentro da aba Dados. Webhook: "Ativo/Desativado/Com falhas" com botão "Desativar/Ativar". |
| N3 | Integração × Chave × API | Menu "Integrações"; aba "Chaves"; Ajuda "Criar integração e chave de API"; Início "Chamadas à API". Para o usuário, "a chave" e "a integração" se confundem. |
| N4 | Requisições × Registros × Chamadas | Aba "Requisições"; aviso "Os registros de requisições…"; janela "Requisição"; Início "Chamadas à API" / "Chamadas com erro"; filtro "Todos os status". |
| N5 | Nota × NFS-e × DPS | Menu "Notas"; coluna "NFS-e"; título "NFS-e 12" ou "Nota em acompanhamento"; título do navegador "Detalhe e histórico da NFS-e"; "Aguardando número"; alertas "Nota (DPS 5)". |
| N6 | Tomador × cliente | "Tomadores" na aba; "O tomador (cliente)" na retenção; "O tomador costuma ser consumidor final?". |
| N7 | "Endereço" com três sentidos | Organização › "Endereço" = identificador no endereço do painel; Webhooks › "Endereços" = URLs; Empresa › "Endereço" = endereço postal. |
| N8 | "Dados" com dois sentidos | Aba "Dados" da empresa (cadastro) e aba "Dados" da integração (nome/descrição/ativa). |
| N9 | Serviço × perfil de serviço | Aba "Serviços", botão "Novo serviço", mas "Nenhum perfil de serviço cadastrado.", "Perfil de serviço salvo.", título "Perfil de serviço". |
| N10 | "Esgotada" × "falhou" | Entregas mostram "Esgotada" para tentativas acabadas; `docs/api/webhooks.md` diz que a entrega "fica como **falhou**". |
| N11 | Empresas "autorizadas" | Webhook: "Todas as empresas autorizadas" e "Empresa não autorizada", embora a regra de empresas autorizadas tenha sido removida (a integração opera todas). A lista de integrações mostra a coluna "Empresas" sempre com "Todas". |
| N12 | Dois "Início" | Menu "Início" = Início da organização; marca notem e títulos do navegador "Início" = tela "Olá, …". |
| N13 | Dois "Suporte" / ícones repetidos | "Suporte" é seção da Ajuda e item de Administração; Ajuda e Suporte usam o mesmo ícone; Organizações (admin) usa o ícone de Empresas; Empresas e notas (admin) usa o de Notas. |
| N14 | Títulos de menu × página × navegador | Início mostra o nome da organização; empresa e integração mostram o próprio nome; navegador mostra "Dados e configuração fiscal da empresa" em qualquer aba e "Integração e webhooks" em qualquer aba. Telas sem login: "Aceitar convite" × "Defina sua senha"; "Recuperar acesso" × "Esqueceu a senha?"; "Nova senha" × "Redefina sua senha". |
| N15 | Termos técnicos/em inglês na tela | "webhook", "curl", "HTTP", "Status", "NSU", "Bearer", "ZIP"; status numéricos (200, 422…) no filtro de requisições; tela de erro inteira em inglês (ver 7.5). |

### 7.2 Funções duplicadas ou espalhadas

| # | O quê | Onde |
|---|---|---|
| D1 | Falhas de webhook em três lugares | Início (quadro), Alertas (lista + "Histórico de falhas de webhook (90 dias)", com os dois ambientes misturados) e Integração › Webhooks (avisos por ambiente + Entregas). |
| D2 | Notas em dois lugares, com telas diferentes | Notas (emitidas e externas, com detalhe em tela própria, filtros e exportação) × Empresa › Notas recebidas (lista própria, detalhe aberto na própria lista, sem busca nem exportação). |
| D3 | "Pronta para emitir" em quatro lugares | Aba da empresa, selo na lista, quadros do Início e alerta "A empresa não pode emitir". |
| D4 | Ambiente tratado de quatro formas | Seletor do topo (preferência do usuário) para Notas, Alertas, Início e Pronta para emitir; os dois ambientes lado a lado em Chaves e Sincronização; sub-abas em Webhooks (começando sempre em Homologação); filtro próprio, começando em "Todos", em Requisições. |
| D5 | Botões de baixar repetidos | No detalhe da nota emitida pela notem, "Baixar PDF" fica isolado acima do botão de voltar e "Baixar XML" fica ao lado do título; na nota externa os dois ficam juntos. |
| D6 | Gestão de pessoas espalhada | Membros aparecem em Equipe (sem ações); convites só em Administração › Organizações e só para o primeiro membro. |
| D7 | Configuração da plataforma misturada | Leiaute fiscal guarda também as datas de obrigatoriedade do IBS/CBS. |
| D8 | Duas telas "Início" | `/dashboard` (lista de organizações) e Início da organização. |

### 7.3 Caminhos para tarefas frequentes (contagem de cliques)

Contagem a partir de qualquer tela da organização, com o menu aberto (computador). Digitação não conta como clique; abrir e escolher numa lista suspensa conta 2.

| Tarefa | Caminho | Cliques |
|---|---|---|
| Ver o certificado de uma empresa | Empresas → empresa → aba Certificado | **3** (+ busca se a lista for longa) |
| Achar uma nota pelo número ou tomador | Notas → digitar → nota | **2** |
| Achar as notas de uma empresa | Notas → filtro Empresa (2) → nota | **4** (não há atalho a partir da empresa) |
| Copiar a chave de API | Integrações → integração → (Chaves) "Gerar nova chave" → copiar | **4**. Uma chave já existente não pode ser copiada (só o prefixo, sem botão de copiar); só no momento em que é gerada |
| Ver um erro de requisição | Integrações → integração → Requisições → "Somente erros" → Detalhes | **5**. Pelo quadro "Chamadas com erro" do Início: 3 com uma integração (a lista abre sem o filtro de erros e com "Todos os ambientes"); 4 com várias |
| Sincronizar uma empresa | Empresas → empresa → Sincronização → Sincronizar | **4**; **6** trocando o período |
| Baixar o PDF de uma nota | Notas → nota → Baixar PDF → Salvar PDF | **4** |
| Cancelar uma nota | Notas → nota → Cancelar nota → motivo (2) → caixa de confirmação → Cancelar nota | **7** + justificativa |
| Ver o webhook que está falhando | Início → "Webhooks falhando" (1 integração) → sub-aba Produção, se estiver em produção | **1–2**; pelo menu, 3–4 |
| Trocar de ambiente | seletor do topo (2) | **2** |
| Ver a equipe de outra organização | seletor de organização (2) → Equipe | **3** |

### 7.4 Ligações quebradas ou que levam a lugar inesperado

| # | Ligação | O que acontece |
|---|---|---|
| L1 | Login a partir de um link (alerta, e-mail, endereço salvo) | Sempre termina em `/dashboard`; o endereço pedido se perde. |
| L2 | Marca notem no menu | Vai para `/dashboard`, não para o Início da organização. |
| L3 | Trocar de organização no topo | Sempre vai para o Início da nova organização, mesmo estando em Notas ou Empresas. |
| L4 | Início › "Webhooks falhando" / "Chamadas com erro" | Abrem a aba certa, mas os Webhooks começam em Homologação e as Requisições em "Todos os ambientes", sem o filtro de erros e sem limitar a 24 horas. |
| L5 | Alertas › "Abrir Pronta para emitir", "Abrir Certificado"… | O endereço usa o nome exibido da aba (`?aba=Pronta%20para%20emitir`); renomear a aba quebra as ligações já abertas/salvas. A integração usa nomes técnicos (`?aba=requisicoes`). |
| L6 | Ajuda › "Abrir Empresas" (certificado, fiscal, serviço, sincronização) | Leva só à lista; o usuário ainda precisa achar a empresa e a aba. O primeiro passo diz só "Abrir". |
| L7 | Ajuda › "Configurar serviço" | Manda usar "Aplicar sugestão", mas o botão chama-se "Ver sugestão da tabela oficial" e depois "Usar". |
| L8 | Voltar do detalhe da nota | Volta para Notas com os filtros apagados (os filtros não ficam no endereço). O mesmo vale para a busca e a página de Empresas. |
| L9 | 404 › "Voltar ao início" | Vai a `/`, que leva a `/entrar` e depois a `/dashboard`. |
| L10 | Equipe/Organização/Administração por endereço direto, sem permissão | Tela de erro em inglês, sem menu, em vez de uma mensagem de acesso. |
| L11 | Menu em telas de 768 a 900 px | O menu fica escondido e não há botão para abri-lo (pelo código). |
| L12 | Nota ↔ empresa | O detalhe da nota não leva à empresa; a empresa não leva às suas notas. |

### 7.5 Telas sem estado vazio, carregando ou com texto técnico

| # | Tela | Exemplo |
|---|---|---|
| T1 | Erro geral | "This page didn't load / Something went wrong on our end / Try again / Go home" (em inglês, para qualquer recusa ou falha de carregamento). |
| T2 | Carregando | Só Certificado e Município têm "Carregando…"; não há indicador nas demais telas. |
| T3 | Detalhe da nota › Resumo e Cancelamento | Datas no formato técnico da API (ex.: `2026-11-16T19:00:00-03:00`) em "Emitida em", "Autorizada em", "Solicitado em", "Registrado em". |
| T4 | Detalhe da nota › Valores e Tomador; Empresa › Tomadores | Rótulos montados do nome técnico do campo, sem acento: "Base calculo", "Aliquota iss", "Valor liquido", "Iss retido", "Tipo: pj", endereço juntado com "·". A nota externa usa rótulos corretos ("Base de cálculo") para os mesmos valores. |
| T5 | Empresa › Dados (rodapé) | "Origem: Painel · Criador: {código interno} · Último editor: {código interno}" — códigos em vez de nomes, e "Painel" fixo mesmo quando a empresa veio pela API. |
| T6 | Configuração fiscal e Serviços | "Detalhes técnicos › Editor: {código interno}"; "Regime especial: código 0". |
| T7 | Empresa › Dados só leitura | Município aparece como código IBGE, não pelo nome. |
| T8 | Notas recebidas | CNPJ do prestador sem máscara. |
| T9 | Pronta para emitir › Município | Campos e respostas literais do governo, "interpretação provável: 1 = habilitados por padrão", "O governo respondeu com status HTTP N". |
| T10 | Webhooks › Entregas | Coluna "HTTP", "Tentativa 3/8", janela "Entrega" com dois códigos internos sem rótulo. |
| T11 | Notas (vazio) | "Nenhuma nota encontrada." sem diferenciar "sem notas" de "filtro sem resultado" e sem orientação. |
| T12 | Integrações (vazio) | "Nenhuma integração cadastrada" sem orientação. |
| T13 | Administração | Quatro telas "Disponível em breve" no menu (Empresas e notas, Municípios, Saúde do sistema, Cobrança). |
| T14 | Topo | Busca "Buscar na notem" visível e desativada. |
| T15 | Datas | Parte das telas usa o horário de Brasília; outras (sincronização, chaves, requisições, entregas, histórico da nota, equipe) usam o relógio do aparelho. |

### 7.6 Botões: mesmo nome com efeitos diferentes, ou o contrário

| # | Botões | Detalhe |
|---|---|---|
| B1 | "Cancelar" | Fecha janelas; na janela do ZIP interrompe a exportação; "Cancelar nota" é ação fiscal. Na janela de cancelamento, o botão que fecha chama-se "Voltar" e o que confirma repete "Cancelar nota". |
| B2 | "Atualizar" × "Atualizar com o governo" | "Atualizar" recarrega a lista de entregas; "Atualizar com o governo" consulta eventos fiscais. |
| B3 | "Revogar" × "Excluir" × "Desativar" | Chave: "Revogar"; endereço de webhook: "Excluir" e "Desativar"; empresa: "Desativar"; integração: desmarcar caixa e salvar. |
| B4 | "Salvar …" | "Salvar empresa", "Salvar configuração", "Salvar serviço", "Salvar alterações", "Salvar". |
| B5 | "Baixar PDF" → "Salvar PDF" | O mesmo botão muda de nome e exige um segundo clique. |
| B6 | "Verificar" | Em Pronta para emitir só verifica o município; o nome sugere verificar a empresa inteira. |
| B7 | "Abrir" × "Abrir Empresas" × "Abrir {aba}" × "Ver alertas" × "Ir para Integrações" | Ligações equivalentes com textos diferentes. |

### 7.7 Outros pontos que dificultam o uso

- O seletor de organização do AP lista todas as organizações da plataforma, numa lista suspensa simples.
- O painel da conta não tem perfil nem troca de senha; não fecha ao clicar fora.
- O "Recolher menu" não é lembrado.
- Busca de Empresas consulta a cada tecla (a de Notas espera o usuário parar de digitar).
- Páginas de tamanhos diferentes (Notas 50, Empresas 30, Requisições 30, Entregas 20, Tomadores 50) e contadores diferentes ("Página N", só "N", nenhum).
- Botões de voltar diferentes: só ícone (empresa), texto acima do título (integração), "← Notas" (nota).
- Sem emissão de nota pelo painel (só pela API); a Ajuda não diz isso.
- O cadastro é o mesmo nos dois ambientes, mas a aba Sincronização e as Chaves mostram os dois ambientes, enquanto o resto segue o seletor — o usuário não tem uma regra única para saber "o que muda com o ambiente".

---

## 8. Dependências que uma reorganização afeta

### 8.1 Ligações internas entre telas (no código)

| De | Para | Como |
|---|---|---|
| Início › quadros de Empresas | Empresas | `?situacao=prontas`, `pendencia` ou `inativas` |
| Início › Chamadas / Erros / Webhooks | Integração | `?aba=requisicoes` / `?aba=webhooks`, ou lista de Integrações |
| Início › "Ver alertas" | Alertas | seção `alertas` |
| Início vazio › "Cadastrar empresa" | Nova empresa | `/o/{org}/empresas/nova` |
| Alertas › Abrir … | Empresa | `?aba=Certificado`, `Serviços`, `Pronta para emitir`, `Sincronização` (nome exibido; tipo `CompanyTab` em `src/lib/alerts.ts`) |
| Alertas › Abrir nota / integração | Nota / Integração | `/o/{org}/notas/{id}`, `/o/{org}/integracoes/{id}` |
| Ajuda › passos | Nova empresa, Empresas, Notas, Integrações | ligações fixas em `help-view.tsx` |
| Menu, `/dashboard`, Admin › Organizações, troca de organização | Início da organização | seção `inicio` |
| Detalhe da nota | outra nota (substituta/substituída) | `/o/{org}/notas/{id}` |
| Substituição concluída | nova nota | navegação automática |
| Nova empresa / salvar empresa | detalhe da empresa | navegação automática |
| Nova integração | detalhe da integração | navegação automática |
| Sair, sessão ausente | `/entrar` | redirecionamento |
| Login, definição de senha | `/dashboard` | redirecionamento |
| Endereço antigo `modelos-de-servico` | Início | redirecionamento permanente na seção da organização |

### 8.2 Endereços e nomes de tela citados fora do painel

| Onde | O que cita |
|---|---|
| E-mail de convite (`notem.functions.ts`, `inviteFirstMember`) | `https://app.notemfiscal.com.br/definir-senha` |
| E-mail de recuperação (`auth-screen.tsx`) | `https://app.notemfiscal.com.br/redefinir-senha` |
| Entrar com Google | volta para `/entrar` (endereço atual) |
| `src/lib/app-url.ts` e `src/test/app-url.test.ts` | endereço oficial e os dois links acima |
| URLs de retorno configuradas no serviço de login (fora do código) | `/entrar`, `/definir-senha`, `/redefinir-senha` |
| `docs/api/sincronizacao.md` | "aba **Sincronização** da empresa"; "botão 'Atualizar com o governo'" |
| `docs/api/webhooks.md` | "painel (Integrações → Webhooks)"; envio de teste e reenvio "pelo painel"; "fica como **falhou**"; tabela "Grupo no painel" |
| `docs/api/empresas.md` | texto exibido "Alterado via API — integração X"; "O painel mostra aviso…" |
| `docs/api/convencoes.md` | webhooks "pelo painel"; integração padrão de cada organização |
| `docs/api/glossario.md` | "Situação da empresa" (pronta para emitir), "Integração", "Situação da nota" |
| `docs/api/openapi.yaml` | "A sincronização é iniciada apenas no painel"; "URL cadastrada no painel"; "resultado no painel" |
| `docs/interno/painel-fase-8.md` | Início, Alertas, Ajuda, Suporte, filtros `?situacao=` e `?aba=` |
| Webhooks e respostas da API | não contêm endereços do painel (conferido no código) |
| `docs/api/LEIAME.md`, exemplos em `docs/exemplos/` | sem endereços do painel |

### 8.3 Endereços antigos com redirecionamento

- `/o/{org}/modelos-de-servico` → `/o/{org}/inicio`.
- `/` → `/entrar`.
- `/auth` e `/reset-password` foram removidos (sem redirecionamento; um teste garante que não existem).

### 8.4 Testes que dependem de nomes de rotas ou textos

| Teste | Depende de |
|---|---|
| `src/test/app-routing.test.tsx` | `/` com página; `/entrar`, `/esqueci-senha`, `/definir-senha`, `/redefinir-senha` existem; `/auth`, `/reset-password` não existem |
| `src/test/app-url.test.ts` | links `/definir-senha` e `/redefinir-senha` no endereço oficial |
| `src/test/home-metrics.test.ts` | valores `prontas`/`pendencia`/`inativas` do filtro no endereço; textos "Tudo em dia", "+N emitida(s)/cancelada(s) fora da notem", "N impeditivos · N de atenção · N informativo" |
| `src/test/panel-home.test.ts` | tipos de ligação dos alertas (`invoice`, empresa com aba) |
| `src/test/validation-messages.test.ts` + `validation-messages.snapshot.json` + `validation-cases.ts` | textos das mensagens dos formulários do painel (Empresa, Integração etc.) |
| `src/test/adn-sync-permission.test.ts`, `layout-settings-permission.test.ts`, `notes-list-permissions.test.ts`, `panel-access.test.ts` | papéis que podem sincronizar, mudar leiaute, listar notas e ler pelo servidor (nomes de função, não de tela) |
| Testes de banco (`*.database.sql`, matriz de isolamento) | nomes das funções e tabelas; não dependem de nomes de tela |

Não há testes de tela (cliques, textos de botões, abas ou menu). Renomear abas ou itens do menu não quebra testes, mas quebra as ligações `?aba=` de 8.1 e os textos de 8.2.

## Regra única de senha (17/11/2026)

- Vale para Minha conta (trocar senha), convite (`/definir-senha`) e recuperação (`/redefinir-senha`): 10 caracteres ou mais, uma letra maiúscula, uma minúscula, um número e um caractere especial (qualquer caractere que não seja letra, número ou espaço). Limite do serviço de login: 72 bytes (letras com acento contam como dois).
- Módulo único `src/lib/password-rule.ts`; lista ao vivo `src/components/notem/password-requirements.tsx`; o botão de salvar só fica ativo com todos os itens cumpridos e "Confirme a senha" igual. Na troca em Minha conta o servidor repete a mesma regra.
- Recusas do serviço de login viram português em `src/lib/auth-messages.ts` (lê só código, status e motivos; nunca o texto do serviço). Ex.: senha em vazamentos → "Esta senha apareceu em vazamentos de dados. Escolha outra."; senha fraca → "Esta senha é fraca. Escolha outra.".
- Limite: em convite/recuperação a senha é gravada pelo navegador direto no serviço de login; para a regra valer também fora do painel, configure a mesma política de senha no painel do Supabase (Authentication → Policies/Providers → Email).

## Menu lateral: grupos recolhíveis (17/11/2026)

- Notas (Emitidas, Recebidas) e Organização (Dados, Equipe) são grupos: o item pai é um botão (`aria-expanded`, seta › fechado / ˅ aberto) que só abre e fecha; a navegação é pelos subitens. Endereços, telas e permissões não mudaram (Organização só para proprietário, administrador e admin da plataforma).
- Ao chegar numa tela do grupo (inclusive por link, ex.: nota recebida ou Equipe), o grupo abre e o subitem fica destacado; nas outras seções os grupos ficam como o usuário deixou. A pessoa pode fechar o grupo da seção atual; ele volta a abrir na próxima navegação dentro do grupo.
- Estado lembrado neste navegador (`notem-menu-grupos`); se o armazenamento falhar, tudo começa fechado, exceto o grupo da seção atual. Grupo fechado não recebe foco pelo Tab.
- Menu recolhido: o ícone abre um menu flutuante ao lado com os subitens (fecha ao escolher, clicar fora ou Esc); o ícone fica destacado na tela do grupo. Celular: igual ao menu expandido; escolher um subitem fecha o menu.
- Código: regra pura `src/lib/nav-groups.ts`, componente `src/components/notem/nav-group.tsx`; testes `src/test/nav-groups.test.tsx`.

## Integração VistoCash — aprovada 26/11; execução A → C3 → B → C2 → C1
- [x] Plano aprovado com ajustes; uma etapa por vez, relatório e aprovação antes de cada publicação
- [ ] A: PIS/COFINS opcional 99/0 por empresa, retrato fiscal, documentação/regimes; destacar reenvio em todo PUT
- [ ] A: não configurar pelo painel para VistoCash antes de o parceiro enviar o campo; testes e relatório, sem publicar
- [ ] C3 (após A): VistoCash PDF 60/min, geral chave/org 600/min, rajada 100/10s, concorrência PDF 2; relatório/aprovação
- [ ] B (após C3): classificação de falhas na notem e motivo técnico privado; relatório/aprovação
- [ ] B: documento separado completo para o dono aplicar no transmissor (arquivos, mudanças, testes); não alterar transmissor/
- [ ] C2 (após B): links PDF 30 dias no app.notemfiscal.com.br para cliente final, hash/revogação/proteção/docs; relatório/aprovação
- [ ] C1 (após C2): somente investigar certificado matriz/filiais e apresentar proposta antes de flexibilizar regras

## Novo visual do painel (neon/vidro) — aprovado 17/11
- [x] Cores e efeitos presos ao painel (docs intacta, com teste)
- [x] Menu lateral, topo, títulos, abas, botões, campos, diálogos, tabelas, selos
- [x] Início: cartões com ícones, rosca sem sobreposição, barras por hora (uma chamada, 24 consultas em paralelo, cache 60 s), "Situação agora"
- [x] Telas de entrada
- [x] Testes de contraste, rosca, horas e documentação intacta
- [x] Prints com dados fictícios (página temporária) — apagada; os 3 endereços dela dão 404
- [x] Relatório
- [x] Publicado e conferido (17/11 20:48 Brasília)
- [ ] (futuro) Histórico de "Empresas por status" — etapa própria, nada agora

# Roadmap — Correções e reorganização do painel

## Parte 1 (publicada)
- [x] 1 Telas de erro pt-BR dentro do painel (não encontrada / sem acesso / falha)
- [x] 2 Login volta ao destino (safeInternalPath ao gravar E ao ler; apagar após uso)
- [x] 3 Botão de menu 768–900 px
- [x] 4 Detalhe da nota e Tomadores legíveis
- [x] 5 Datas em Brasília em todas as telas
- [x] 6 Códigos fixos ?aba= (empresa e integração) + conversão dos nomes antigos
- [x] 7 Filtros no endereço (Notas, Empresas, Requisições)
- [x] 8 Atalhos do Início (erros 24h + ambiente; webhooks do ambiente)
- [x] 9 Restos (busca do topo, "autorizadas", coluna Empresas)
- [x] 10 Sem códigos internos (nomes, origem, município, CNPJ, regime)
- [x] 11 PDF em um clique; PDF+XML juntos
- [x] 12 Pequenos ajustes
- [x] Testes da Parte 1 + relatório

## Parte 2 (aprovada)
- [x] Menu de 6 itens, marca → Início, /dashboard direto com uma organização, Administração sem telas "em breve"
- [x] Notas › Recebidas (lista, filtros, CSV/ZIP, prova de posse) e detalhe próprio /notas/recebidas/{id} (id inválido → não encontrada, com teste)
- [x] Empresa: caminho clicável, CNPJ, Resumo com o que falta, aviso de cadastro compartilhado, aba antiga Recebidas → Recebidas filtrada
- [x] Integração: abas novas, só o ambiente do topo, confirmações com o ambiente, Chamadas
- [x] Organização (Dados/Equipe), troca de organização → Início se a seção não é permitida
- [x] Minha conta: nome 2–80, troca de senha (senha atual conferida, mínimo 8, encerra outras sessões e mantém a atual), Definir senha para Google
- [x] Regra única de ambiente, glossário, 50 por página, títulos, redirecionamentos, docs
- [x] Testes, matriz de isolamento, OpenAPI, relatório

## Ajuste de senha antes de publicar a Parte 2
- [x] Regra única (10+, maiúscula, minúscula, número, especial) nas três telas, lista ao vivo, botão só com tudo cumprido
- [x] Recusas do serviço de login em português (fraca, vazamento etc.)
- [x] Testes
- [x] Publicar e confirmar (16/11 21:38 Brasília)
- [ ] (etapa própria) 14 avisos antigos do banco

## Menu lateral recolhível
- [x] Grupos Notas e Organização recolhíveis (seta, abre sozinho, lembrado, flutuante no recolhido, celular, teclado)
- [x] Testes
- [x] Publicar (16/11 21:50 Brasília)

## Documentação pública (docs.notemfiscal.com.br) — aprovada 17/11
- [x] Domínio: docs ↔ app por endereço; painel no docs → app.; /api e funções internas no docs → não encontrada; app./docs → docs; raiz/www/.lovable.app → 301 app.; prévia em /docs
- [x] app.: só noindex (X-Robots-Tag + robots.txt bloqueando); docs: robots.txt, sitemap.xml, cabeçalhos próprios; painel/API com cabeçalhos iguais
- [x] docs sem sessão do painel nem chamada ao banco
- [x] docs/api reorganizado em um arquivo por página (mover, não duplicar) + tabela trecho antigo → novo
- [x] Páginas novas (primeiros passos, guias, webhooks, referência)
- [x] openapi.yaml: tags 11 grupos, descrições, exemplos fictícios nas 40 operações, validados pelo esquema
- [x] Termos internos nas mensagens corrigidos na fonte (E0714, E0855, varredura), historico.md, snapshot, teste
- [x] Site: layout, busca local, abas cURL/JS, copiar, avisos, tema do aparelho + troca guardada, anterior/próxima, não encontrada, llms.txt
- [x] Link "?" do painel → DOCS_URL
- [x] Testes: interno ausente, termos proibidos, 40 operações, links, limites, domínios, dados reais ausentes, sem perda/duplicação
- [x] Prints claro/escuro, computador/celular; relatório
- [ ] (após aprovação) publicar; você conecta o domínio e desmarca o principal; eu provo redirecionamentos (.lovable.app)

## Revisão de texto da documentação (17/11, antes de publicar)
- [x] 40 operações: subtítulo de uma linha + descrição em frases completas, sem códigos soltos, E0xxx com significado
- [x] Guias: emissão, cancelamento, substituição, ciclo de vida, configuração fiscal, idempotência — sem jargão interno
- [x] Busca: resumo só texto (sem código/JSON/Markdown)
- [x] Blocos de código: linhas longas quebram (sem corte) nas duas colunas e no celular
- [x] Relatório antes/depois (5 operações + trecho de Emissão); não publicar

## Saúde do sistema + avisos por e-mail (pedido 17/11)
- [x] Plano aprovado (17/11, com ajustes)
- [x] Publicar antes só o visual novo e confirmar no ar (17/11 20:48 Brasília)
- [x] Gravação das chamadas ao governo depois da resposta, falha descartada com registro interno; teste de falha durante emissão
- [x] GET /api/public/saude/ping (200 ok < 15 min / 503 verificacao_atrasada; sem detalhes, sem log de API, no-store, noindex) + passo a passo do Monitoring (200, 5 min, 2 falhas)
- [x] Avisos começam desligados
- [x] Tela Administração › Saúde do sistema (8 blocos, topo, Verificar agora)
- [x] Registro das chamadas reais ao governo; tabelas só do servidor com limpeza de 30 dias
- [x] Rota OIDC separada a cada 5 min + comando do Cloud Scheduler
- [x] Avisos por e-mail (Resend, destinatários, teste, estados, lembrete 6 h, Resolvido)
- [x] Vigia externo (passo a passo) e conferência da tabela notem_rls_probe_
- [x] Testes, matriz de isolamento, prints, relatório; não publicar
- [ ] Chave do Resend (RESEND_API_KEY) — aguardando o dono cadastrar
- [ ] Criar tarefa do Scheduler e uptime check — o dono cria no Google Cloud após publicar
- [x] Publicado (17/11 21:13 Brasília)

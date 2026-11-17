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
- [ ] Publicar e confirmar
- [ ] (etapa própria) 14 avisos antigos do banco

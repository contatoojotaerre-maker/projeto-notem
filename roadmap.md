# Roadmap — Correções e reorganização do painel

## Parte 1 (concluída; aguarda aprovação; não publicar)
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

## Parte 2 (aguarda aprovação da Parte 1)
- Ver plano aprovado. Ajustes do usuário:
  - /o/{org}/notas/recebidas/{id} nunca tratada como /notas/{id}; id inválido nas duas → "Página não encontrada" (com teste)
  - Trocar senha: conferir senha atual de verdade; mínimo igual ao cadastro (8); encerrar outras sessões e manter a atual; mensagens genéricas
  - Troca de organização: seção não permitida no novo papel → Início, sem tela de "sem acesso"
  - Nome em Minha conta: obrigatório, 2–80 caracteres, não só espaços, mensagem pt-BR

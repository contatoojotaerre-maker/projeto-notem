# Roadmap — Correções e reorganização do painel

## Parte 1 (em andamento; não publicar)
- [ ] 1 Telas de erro pt-BR dentro do painel (não encontrada / sem acesso / falha)
- [ ] 2 Login volta ao destino (safeInternalPath ao gravar E ao ler; apagar após uso)
- [ ] 3 Botão de menu 768–900 px
- [ ] 4 Detalhe da nota e Tomadores legíveis
- [ ] 5 Datas em Brasília em todas as telas
- [ ] 6 Códigos fixos ?aba= (empresa e integração) + conversão dos nomes antigos
- [ ] 7 Filtros no endereço (Notas, Empresas, Requisições)
- [ ] 8 Atalhos do Início (erros 24h + ambiente; webhooks do ambiente)
- [ ] 9 Restos (busca do topo, "autorizadas", coluna Empresas)
- [ ] 10 Sem códigos internos (nomes, origem, município, CNPJ, regime)
- [ ] 11 PDF em um clique; PDF+XML juntos
- [ ] 12 Pequenos ajustes
- [ ] Testes da Parte 1 + relatório

## Parte 2 (aguarda aprovação da Parte 1)
- Ver plano aprovado. Ajustes do usuário:
  - /o/{org}/notas/recebidas/{id} nunca tratada como /notas/{id}; id inválido nas duas → "Página não encontrada" (com teste)
  - Trocar senha: conferir senha atual de verdade; mínimo igual ao cadastro (8); encerrar outras sessões e manter a atual; mensagens genéricas
  - Troca de organização: seção não permitida no novo papel → Início, sem tela de "sem acesso"
  - Nome em Minha conta: obrigatório, 2–80 caracteres, não só espaços, mensagem pt-BR

# notem — Fase 1
- [x] Aplicar fundação com os ajustes aprovados: banco, isolamento, convites e auditoria.
- [x] Implementar login, painel, organizações, empresas e preferências.
- [x] Verificar regras locais e páginas públicas: 7 testes aprovados, verificações desktop/celular sem erros.
- [x] Entregar guia Supabase/Google e textos de e-mail em português.
- [ ] Validar login, convites e isolamento com usuários reais — depende das configurações externas e municípios oficiais; Supabase externo não fornece sessão de teste gerenciada.
- [ ] Enviar aviso por e-mail para conta existente — aguarda domínio de envio; convite pendente e aceite explícito já implementados.
- [x] Integrar marca no login, menu e favicon; originais preservados e fundo WebP otimizado.
- [x] Unificar rotas públicas em português, remover duplicadas e entregar guia v2; 13 testes e verificações públicas aprovados.
- [x] Revogar execução pública de rls_auto_enable; teste de nova tabela passou e gatilho ensure_rls permanece habilitado; aviso específico removido.
- [x] Explicar rls_auto_enable e consultar RLS: as oito tabelas públicas têm RLS ativo.
- [x] Nova organização: tipo (partner/company), endereço no painel 3–50 com prévia e unicidade, filtro por tipo.

## Fase 2A — somente análise e plano nesta solicitação
- [x] Responder viabilidade com evidências e preparar plano completo para aprovação; mTLS hospedado e XMLDSig ainda não comprovados, Swagger não anexado.
- [ ] Aplicar certificados, autorizações e conexão real — aguarda aprovação do plano, definição do impedimento de mTLS se confirmado e certificado real do usuário.
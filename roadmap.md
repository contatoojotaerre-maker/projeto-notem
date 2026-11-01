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
- [ ] Provar API mTLS cert/key em Edge Function hospedada antes do restante — aprovado pelo usuário, bloqueado pela ferramenta que proíbe criar novas Edge Functions neste projeto TanStack.
- [ ] Ler docs/referencias/LEIAME.md e Swagger oficial — pasta ausente no checkout disponível; aguarda disponibilização.
- [ ] Manter seis funções e adicionar testes de autorização; garantir imutabilidade de companies.organization_id — após prova inicial, conforme ordem aprovada.
- [ ] Implementar guarda, abas e auditoria nas Edge Functions aprovadas — aguarda desbloqueio da criação, prova mTLS e documentação.
- [ ] Validar conexão real de homologação com A1 do usuário pelo formulário seguro — depende da etapa anterior e certificado real.
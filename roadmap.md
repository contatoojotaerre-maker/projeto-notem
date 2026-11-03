# notem — Fase 1
## Configuração fiscal e perfis de serviço
- [x] Plano aprovado com os ajustes de CNPJ protegido e reserva definitiva.
- [ ] Criar catálogos vazios, configuração/perfis, séries e reserva atômica definitiva; aplicar permissões e proteção condicional do CNPJ.
- [ ] Implementar abas fiscais/serviços e ajustes de Prontidão; testar regras e informar os catálogos para carga SQL.

## Catálogos oficiais e busca municipal
- [x] Plano aprovado; CSV conferidos com 5.570 municípios, 250 países e códigos únicos.
- [x] Busca indexada sem acentos/por IBGE e estados do campo aplicados; 11 testes passaram e aplicativo sem erros.
- [ ] Aplicar carga idempotente — bloqueada pelo envio apenas inline da ferramenta de migração; SQL integral preparado em Files, banco continua vazio.
- [ ] Validar contagens, valores e idempotência no banco — depende da carga; validação das funções pela conexão de leitura é restrita por permissões.
- [ ] Verificar busca na tela conectada — Supabase externo sem sessão de teste disponível; navegação de teste foi redirecionada para entrar.

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

## Fase 2A (revisada — transmissor)
- [x] Tabelas, troca atômica, imutabilidade de organization_id da empresa.
- [x] Cliente do transmissor, envio de certificado, consulta de convênio (valores crus, intervalo de 1 min por empresa/ambiente).
- [x] Abas Certificado e Prontidão; testes de regras.
- [x] Cadastrar TRANSMISSOR_URL e GOOGLE_SERVICE_ACCOUNT_JSON.
- [ ] Aceite real: A1 Grupo Jota (IBGE 4212254) e resposta de homologação — aguarda segredos e certificado.

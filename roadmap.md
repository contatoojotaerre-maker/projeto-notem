# notem — Fase 1
## Fase 3A — Integrações e primeira rota da API
- [x] Plano aprovado; testar /api/v1 primeiro, adotar /api/public/v1 sem aliases apenas se bloqueado, atualizando somente a base do contrato.
- [ ] Publicar para teste externo autorizado; informar URL e Redirect URLs /entrar, /definir-senha e /redefinir-senha.
- [ ] Validar waitUntil hospedado; se indisponível, gravar sincronamente e informar impacto medido.
- [x] Prova externa: /api/v1/status publicado respondeu 401 JSON com X-Request-Id sem sessão às 23:02:49 UTC. Base /api/v1 preservada, sem aliases. Quatro tabelas criadas com RLS, leitura de metadados sem hash e escrita só servidor; limpeza diária 03:00 UTC.
- [ ] Após aprovação, implementar e testar isolamento, limite de duas chaves por ambiente, sanitização e retenção de 90 dias; verificar acesso externo sem sessão do painel.
- [ ] Página pública /docs gerada de docs/api/ — fase final, fora da Fase 3A.

## Redesenho fiscal guiado
- [x] Plano aprovado: Configuração fiscal e Serviços simples, avançado recolhido e alíquota opcional de ISS do Simples.
- [x] Aplicar redesenho e alíquota opcional; E0713 no formulário, função autenticada e banco: não optante exige três percentuais e não permite none. Preservar linhas antigas incompatíveis e avisar na tela.
- [x] 46 testes locais aprovados, validações de banco com rollback aprovadas e aplicativo sem erros; sem alterações em transmissor/.
- [ ] Conferir visual e salvamento/leitura das abas autenticadas — Supabase externo sem sessão de teste disponível; navegador redirecionou para /entrar.

## Configuração fiscal e perfis de serviço
- [x] Plano aprovado com os ajustes de CNPJ protegido e reserva definitiva.
- [x] Criar três catálogos vazios, configuração/perfis, séries e reserva definitiva; aplicar RLS/concessões e proteção condicional do CNPJ.
- [x] Implementar abas fiscais/serviços e Prontidão; 42 testes locais e testes de banco com rollback aprovados. Confirmadas regras condicionais, papéis, isolamento, reserva sem emissão, limite e ambientes separados; catálogos com zero linhas.
- [ ] Conferir salvamento/leitura nas telas conectadas e catálogos reais — depende de sessão externa de teste disponível e carga SQL pelo usuário; Supabase externo não permite sessão de teste gerenciada.
- [ ] Teste concorrente de atribuição/reserva e proteção CNPJ em sessões simultâneas — sem conexão SQL de teste multissessão disponível; bloqueios transacionais implementados, execução concorrente não verificada.

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

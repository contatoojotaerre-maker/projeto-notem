# notem — Fase 1
## Fase 5 — Cancelamento, análise fiscal e substituição
- [x] Plano aprovado com ajustes; transmissor/ intocado.
- [x] Parte 1: montador de eventos e101101/e101103 e grupo subst, testes XSD (268 testes OK), exemplos em docs/exemplos/eventos/.
- [x] Conferência externa dos três XML aprovada pelo proprietário.
- [x] Normalização de texto NFS-e (travessões, aspas, reticências, espaços, quebras) em todos os campos da DPS e eventos; 422 "contém caracteres não aceitos pela NFS-e" antes de numerar/enviar; texto normalizado gravado; convencoes.md; testes com textos colados.
- [x] Parte 2: banco/fluxo fiscal, reconciliação E0840, verificação sem reenvio e substituição atômica; testes de banco com desfazimento passaram.
- [x] Parte 3: rotas cancelar/solicitar-analise-cancelamento/substituir/eventos XML; cancelamento.md, notas.md, webhooks.md, convencoes.md e OpenAPI 3.1 válido.
- [x] Parte 4: painel (cancelar, análise, substituir, aviso de pendência, XML do evento) e testes automatizados.
- [ ] Teste real de cancelamento/substituição no governo e tela autenticada — dependem de autorização explícita para ação fiscal real (nota nº 11) ou de nota de homologação, e de sessão de teste no painel.

## Auditoria da documentação API
- [x] Separar contrato público e notas internas, corrigir textos e incluir exemplos completos de webhooks.
- [x] OpenAPI 3.1.0 válido — 0 erros (openapi-spec-validator 0.7.2); 256 testes passaram, incluindo especificação inválida de controle. Informar arquivos alterados/criados/movidos; API sem mudanças e sem publicação nesta auditoria.

## Etapa E2 — DANFSe e proteção de numeração
- [x] Máscaras e localidades, três reduções IBS/CBS e quebra entre palavras ajustadas; PNGs base/homologação regenerados e inspecionados, 254 testes passaram e build OK; publicação solicitada ao encerrar (conclusão não verificada).
- [x] Plano E2 aprovado: seguir ordem proposta; transmissor/ intocado.
- [x] Gerador DANFSe, preferência de canhoto e sete exemplos PNG em docs/exemplos/danfse/ e Files para entrega no chat; QR decodificado.
- [x] Downloads API/painel, links e documentação; API PDF testada com fixture real em memória. Painel autenticado não verificado (Supabase externo).
- [x] Séries automáticas desde 900 e saltos duráveis E0014; teste DB com rollback passou, cinco saltos e seis históricos, grants corrigidos e conferidos.
- [x] 254 testes locais, sete PNGs inspecionados; build OK; scan sem críticos (seis informativos).
- [x] Solicitação de publicação E2 ao finalizar; confirmação do resultado pela ferramenta e produção separadas.
- [ ] PDF de nota autorizada real e emissão A1/continuação E0014 hospedada — banco sem notas, sem sessão externa disponível; depende do teste do proprietário.

## Etapa E1 — Emissão e tomadores
- [x] Ler contratos de notas e transmissor v2 pelo anexo autorizado como fonte até a sincronização normalizar; sem editar transmissor/.
- [x] Plano aprovado em cinco partes com complementos; PDF usa PDF_EM_PREPARACAO (503), mensagem “PDF em preparação”.
- [x] Parte 1: banco/rotas de tomadores, notas.md/openapi com complementos; chamadas autenticadas externas não verificadas.
- [x] Parte 2: três XML passam sem erros no XSD com somente TSSerieDPS corrigido em memória; ZIP intacto e 10 testes DPS passaram. Exemplos entregues no chat.
- [x] Primeira conferência externa: três XML passaram no XSD com correção em memória; proprietário identificou E0431/E0432, E0710/E0712/E0713 e E0202.
- [x] Correções pré-Parte 3: descontos zero omitidos, matriz de tributos em tela/API/banco/DPS, legados incompletos sem reescrita, tomador distinto na validação pré-numeração, testes e documentação. 193 testes passaram; nove combinações no banco e legado sem consumo de número validados com rollback. Tela autenticada/API com chave não verificadas (Supabase externo).
- [x] Regenerar três XML: todos passaram no XSD com correção isolada em memória; entregar completos no chat para nova conferência. Sincronização GitHub permanece não verificada.
- [x] Segunda conferência externa: três XML aprovados em XSD/regras; Partes 3–5 liberadas em 14/11/2026.
- [x] Validações pré-reserva E0172/E0174/E0175, E0204/E0237; legados preservados e incompletos; traduções do Anexo I e testes.
- [x] Parte 3: emissão idempotente duradoura, número/nota atômicos, persistência anterior à transmissão, resultados e webhooks atômicos.
- [x] Parte 4: consulta automática com leases, 404 por 15 minutos e reconciliação sem reenvio ambíguo.
- [x] Parte 5: consultas API/XML/PDF, painel somente leitura e tomadores, mensagens de rejeição, documentação; 238 testes passaram, XSD dos três XML válido, testes DB com rollback aprovados, build OK.
- [x] Publicação E1 solicitada para https://app.notemfiscal.com.br; confirmação externa das novas rotas pendente.
- [ ] Emissão real com chave/A1 e painel autenticado — depende do teste externo do proprietário (Supabase externo sem sessão gerenciada); não verificado.

## Fase 3A.2 — Webhooks e ajustes de Integrações
- [x] Correção pós-auditoria: teste direto com resultado na tela, eventos reais em fila sem waitUntil, mensagens em português, registro resumido do agendador, chave de autorização, revelar segredo, filtro por empresa, exemplo e docs.
- [x] Teste publicado: webhook.teste entregue ao webhook.site (HTTP 200, 598 ms) pelo agendador; ciclo registrado com resumo.
- [ ] Clicar "Enviar teste" no painel (tentativa direta) — sem sessão de teste no Supabase externo; fica com o usuário.
- [x] Ler contrato docs/api/webhooks.md e convenções; preparar plano aprovado com Google Cloud Scheduler e DNS preflight sem IP pinning.
- [x] Provar waitUntil e rota POST /api/public/webhooks/process com OIDC Google: 401 sem token; 200 com Google real e req_0c386b1ec9a046cc90ee0bb33f2c11cf confirmado no banco. URL/auth informadas; tarefa Google Cloud a cada minuto será criada pelo usuário.
- [x] Aplicar plano aprovado: HTTPS/DNS sem IP pinning, quatro tabelas/RLS, motor de assinaturas/entregas, telas e docs. Testes de banco com rollback passaram (8 tentativas, reenvio, corpo preservado, sucesso limpa falha, desativação/alerta 3 dias, grants/RLS); 101 testes locais passaram.
- [ ] Criar tarefa Google Cloud Scheduler a cada minuto — depende do proprietário; configuração em docs/interno/agendador-webhooks.md.
- [ ] Validar cadastro, teste e leitura em tela autenticada com receptor real — Supabase externo sem sessão de teste gerenciada; navegador redirecionou para /entrar, sem erros.
- [ ] Confirmar publicação definitiva e processamento OIDC externo — republicação solicitada; chamadas externas ainda serviram o diagnóstico anterior, não o motor definitivo.

## Fase 3A — Integrações e primeira rota da API
- [x] Plano aprovado; testar /api/v1 primeiro, adotar /api/public/v1 sem aliases apenas se bloqueado, atualizando somente a base do contrato.
- [x] Publicação inicial confirmada; URL e três Redirect URLs informadas. Nova publicação com integrações solicitada.
- [x] Publicação atualizada confirmada: /api/v1/status retornou 401 e Server-Timing api-log background; req_aef31f2dff00489593bb74583c3c9d7b confirmado no banco. waitUntil disponível hospedado; sem espera síncrona da gravação (duration_ms antes do agendamento: 0 ms na chamada sem chave).
- [x] Prova externa: /api/v1/status publicado respondeu 401 JSON com X-Request-Id sem sessão às 23:02:49 UTC. Base /api/v1 preservada, sem aliases. Quatro tabelas criadas com RLS, leitura de metadados sem hash e escrita só servidor; limpeza diária 03:00 UTC.
- [x] Implementar lista/detalhe, geração/revogação e logs com filtros; 55 testes locais passaram e testes de banco com rollback passaram (limite por ambiente, revogação, papéis, empresa de outro tenant quando disponível e concessões sem hash/escrita direta). Limpeza SQL diária ativa às 03:00 UTC.
- [ ] Conferir criação, geração e leitura na tela autenticada com chave real — Supabase externo sem sessão de teste gerenciada. Concorrência multissessão não exercitada; lock de integração implementado.
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
- [x] Modal de webhook redesenhado + assinatura por grupo (curingas) e publicação

## Fase 3B — API de empresas
- [x] Banco: ativa, id_externo, origem/integração, idempotência, situação, avisos de certificado, exclusão segura, developer só leitura, integrações = organização inteira.
- [x] Rotas /api/v1 de empresas, configuração fiscal, certificado, serviços, situação, verificação de município e catálogos.
- [x] Situação única (painel e API), webhook de situação, rotina diária de certificados.
- [x] Painel: sem seleção de empresas, aba Situação, desativar/reativar, "Alterado via API", filtro por empresa nas requisições.
- [x] Documentação (openapi, convencoes, empresas, webhooks, glossario) e testes de regras.
- [ ] Verificação externa com chave de homologação — feita pelo usuário.
- [ ] Testes de banco do papel developer e da exclusão com dados reais — não executados.

## Fase 7 — Sincronização com o ADN
- [x] Parte 1: núcleo publicado; primeira sincronização da Group Jota concluída (13 NSUs) e nota nº 11 cancelada como registrada fora da notem. Aguardando aprovação para a Parte 2.
- [x] Ajuste A: sincronização só manual por empresa/ambiente, busca ≤25 etapas com 2 s, homologação permitida; Scheduler só continua pedidos.
- [x] Ajuste B (cópia): 18 XML copiados para o bucket privado e conferidos byte a byte.
- [ ] Ajuste B (remoção das colunas de XML): aguardando aprovação do relatório pelo usuário.
- [x] Ajuste C: verificação diária com data/hora, verificadas e atualizadas na aba Sincronização.
- [x] Parte 2: API (origem, notas recebidas, situação da sincronização), sincronizacao.md, OpenAPI, nota.desbloqueada_prefeitura.
- [x] Parte 3: painel (selo/filtro de origem, abas Sincronização e Notas recebidas, Atualizar com o governo) e testes. Telas não verificadas com sessão real (projeto sem login de teste disponível).

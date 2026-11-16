# Painel da organização (Fase 8) — notas internas

## Busca e totais
- `list_org_notes`/`org_notes_count` montam só os filtros ativos (`org_notes_query`), com a mesma prova de posse para notas de fora da notem. Busca: chave de acesso (estrutura 9+14+27), número (só dígitos), documento do tomador normalizado (`note_taker_document` / `normalize_cnpj`) e nome sem acentos e minúsculo (`normalize_search_text`, trigram em `extensions`).
- `org_notes_summary` só conta (sem valores desde a revisão do Início de 16/11/2026): emitidas = autorizadas, em cancelamento, canceladas e substituídas; canceladas; rejeitadas. Janela `[de, até)` em dias de Brasília, pela data de emissão. `note_amount` foi removida em 16/11/2026 (nada mais dependia dela).
- Teste: `src/test/notes-panel.database.sql` (desfaz tudo): notem 5/1/1 e de fora 4/1/0.

## Planos de consulta (EXPLAIN, 16/11/2026, dados reais da Group Jota)
- CNPJ do tomador (`12.345.678/0001-95`): `Index Scan using invoices_taker_document_idx` e `Index Scan using nfse_documents_taker_norm_idx`, ambos com `Index Cond` no documento normalizado `12345678000195`.
- Nome (`acao externa`): com o volume atual (dezenas de notas) o planejador prefere o índice por organização/ambiente e filtra o nome. Isolado, o predicado usa `Bitmap Index Scan on invoices_taker_name_trgm_idx` e `nfse_documents_taker_name_trgm_idx`; com mais volume o planejador passa a escolhê-los.

## Exportações
- CSV: até 10.000 notas, montado no servidor com o cliente do usuário (regras de linha valem), BOM, `;`, vírgula decimal, proteção contra fórmula.
- ZIP (opção A): o navegador pede lotes de 20 (até 500 notas). O início grava `notas.exportacao_zip_inicio` em `admin_audit_events` com filtros congelados; cada lote confere os IDs contra `list_org_notes` do próprio usuário (um ID fora recusa o lote inteiro), um lote por vez por usuário (`api_slot_acquire`) e 30 pedidos/minuto (`api_rate_check`, bucket `painel_arquivos`, ajustável por organização). O fim (`concluida` ou `interrompida`) grava `notas.exportacao_zip_fim`. Se a aba fechar, o fim não é gravado; o início fica como evidência.

## Suporte
- `platform_settings` continua sem leitura para usuários. `platform_support_contact()` e `set_platform_support()` só executam com service role; o servidor confere login (leitura) ou administrador da plataforma (escrita, auditada).

## Início (revisão de 16/11/2026)
- Só números: Empresas (Total, Prontas, Com pendência, Inativas → `/empresas?situacao=prontas|pendencia|inativas`), Notas (Emitidas, Canceladas, Rejeitadas), Integração (24 h) e uma linha de Alertas. Sem valor total, últimas notas, “Ativas” ou lista de pendências.
- Situação da empresa: `companySituation` (`src/lib/home-metrics.ts`), a mesma no Início e no filtro da lista; a prontidão usa o ambiente selecionado.
- Comparação (`comparisonPeriods`): mês atual × mês anterior do dia 1 ao mesmo dia (limitado ao último dia daquele mês); mês anterior × mês retrasado; últimos 30 × 30 anteriores. Anterior zero → “—”. Compara o número grande (só notas da notem). Canceladas/Rejeitadas: subir usa o tom de atenção; Emitidas: subir usa o tom positivo.
- Integração: `org_integration_summary(_org, _env, _de, _até)` (invoker; a regra de linha dos registros vale: proprietário, administrador, desenvolvedor e admin da plataforma). Conta só chamadas com chave encontrada e não recusadas com 401. Erro = status ≥ 400 (4xx do pedido, 5xx da notem). O bloco aparece só para esses papéis. “Webhooks falhando” = alertas `webhook_falha` (mesma regra da tela Alertas).
- Índice `api_logs_org_env_auth_date (organization_id, environment, created_at) INCLUDE (status_code) WHERE key_id IS NOT NULL AND status_code <> 401`. EXPLAIN ANALYZE (16/11/2026, Group Jota, produção, 24 h): `Index Only Scan using api_logs_org_env_auth_date`, `Index Cond` em organização, ambiente e intervalo, `Heap Fetches: 0`, 0,17 ms.
- Testes: `src/test/home-metrics.test.ts` (períodos, mesmo tamanho, anterior zero, virada de ano, fora da notem, alertas), `src/test/home-integration.database.sql` (por ambiente, por organização e por papel; desfaz tudo) e a matriz de isolamento (`org_integration_summary` por ambiente).
- Interrupção do ZIP: não registrada agora; a tela de auditoria da Fase 9 tratará exportação sem fim após 1 hora como interrompida.

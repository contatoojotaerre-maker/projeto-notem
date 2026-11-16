# Painel da organização (Fase 8) — notas internas

## Busca e totais
- `list_org_notes`/`org_notes_count` montam só os filtros ativos (`org_notes_query`), com a mesma prova de posse para notas de fora da notem. Busca: chave de acesso (estrutura 9+14+27), número (só dígitos), documento do tomador normalizado (`note_taker_document` / `normalize_cnpj`) e nome sem acentos e minúsculo (`normalize_search_text`, trigram em `extensions`).
- `org_notes_summary` soma `note_amount(...)` (texto decimal → `numeric`, nunca float) e devolve texto com 2 casas. Emitidas = autorizadas, em cancelamento, canceladas e substituídas; o valor soma só autorizadas e em cancelamento. Janela `[de, até)` em dias de Brasília.
- Teste: `src/test/notes-panel.database.sql` (desfaz tudo). Em 16/11/2026: 0,10 + 0,20 + 1.749,99 + 0,05 = "1750.34" (notem) e 0,10 + 0,20 + 33,33 = "33.63" (de fora), centavos exatos.

## Planos de consulta (EXPLAIN, 16/11/2026, dados reais da Group Jota)
- CNPJ do tomador (`12.345.678/0001-95`): `Index Scan using invoices_taker_document_idx` e `Index Scan using nfse_documents_taker_norm_idx`, ambos com `Index Cond` no documento normalizado `12345678000195`.
- Nome (`acao externa`): com o volume atual (dezenas de notas) o planejador prefere o índice por organização/ambiente e filtra o nome. Isolado, o predicado usa `Bitmap Index Scan on invoices_taker_name_trgm_idx` e `nfse_documents_taker_name_trgm_idx`; com mais volume o planejador passa a escolhê-los.

## Exportações
- CSV: até 10.000 notas, montado no servidor com o cliente do usuário (regras de linha valem), BOM, `;`, vírgula decimal, proteção contra fórmula.
- ZIP (opção A): o navegador pede lotes de 20 (até 500 notas). O início grava `notas.exportacao_zip_inicio` em `admin_audit_events` com filtros congelados; cada lote confere os IDs contra `list_org_notes` do próprio usuário (um ID fora recusa o lote inteiro), um lote por vez por usuário (`api_slot_acquire`) e 30 pedidos/minuto (`api_rate_check`, bucket `painel_arquivos`, ajustável por organização). O fim (`concluida` ou `interrompida`) grava `notas.exportacao_zip_fim`. Se a aba fechar, o fim não é gravado; o início fica como evidência.

## Suporte
- `platform_settings` continua sem leitura para usuários. `platform_support_contact()` e `set_platform_support()` só executam com service role; o servidor confere login (leitura) ou administrador da plataforma (escrita, auditada).

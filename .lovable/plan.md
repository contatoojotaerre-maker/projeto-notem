# Fase 3B — API de empresas (cadastro e preparação para emitir)

Contrato: `docs/api/empresas.md` + `convencoes.md`, `glossario.md`, `webhooks.md`. Nada em `transmissor/` muda.

## Pontos do contrato que precisam da sua decisão
1. **`convencoes.md` contradiz a decisão 1**: diz "a integração só opera as empresas autorizadas" e lista `403 EMPRESA_NAO_AUTORIZADA`. Proposta: remover a frase e marcar o código como reservado (não usado), já que empresa de outra organização devolve `404`.
2. **`id_externo`**: `convencoes.md` diz "único por integração"; o brief e `empresas.md` dizem "por organização". Proposta: por organização, e corrigir `convencoes.md`.
3. **Idempotência**: `convencoes.md` fala em `POST` e `PATCH`; `empresas.md` em "todos os POST"; o brief inclui `PUT` e `DELETE`. Proposta: aceitar nos quatro e alinhar os dois documentos.
4. **"Não tem notas"**: ainda não existe tabela de notas. A exclusão checará só a numeração DPS (nunca reservada em nenhum ambiente); a checagem de notas entra junto com a emissão.
5. **`ativa`**: hoje a empresa só tem `status = configuring`. Proposta: nova coluna `active` (booleano, padrão verdadeiro), independente do status derivado.

## 1. Banco (migração única)
- `companies`: `active`, `external_id` (até 100, único por organização quando preenchido), `changed_by_integration_id`.
- `company_service_profiles`: `external_id` (mesma regra) e `changed_by_integration_id`; `company_fiscal_settings` também ganha `change_origin` + `changed_by_integration_id`. Gatilho: alteração vinda do painel limpa a integração.
- **Integrações**: migrar `company_scope` "selecionadas" → "todas", travar a coluna em "todas" (check) e apagar os vínculos `integration_companies`. O filtro por empresa dos webhooks continua.
- **Idempotência** `api_idempotency_keys`: integração + ambiente + chave (única), método+rota, hash SHA-256 do corpo, status e resposta guardados, expira em 24 h, limpeza na rotina diária. Só o servidor acessa. Pedido concorrente com a mesma chave → `409 CONFLITO` até o primeiro terminar.
- **Situação**: `company_readiness_state` (empresa + ambiente, último `pronta_para_emitir`), usada para disparar o webhook uma única vez por mudança.
- **Avisos de certificado**: `certificate_expiry_notices` (certificado + marco 30/15/7/1/vencido, única) → nunca duplica; heartbeat `certificate_daily` garante 1×/dia.
- **Exclusão**: função `delete_company_if_unused` (só servidor) que trava a empresa, confere `dps_sequences` (nenhum número reservado) e remove serviços, material e metadados do certificado; senão `EMPRESA_POSSUI_HISTORICO`. Auditoria de certificado preservada por regra legal? — proposta: mantida com `company_id` desvinculado.
- **Papel developer pelo banco**: as políticas de escrita de empresas, configuração fiscal e serviços passam a exigir owner/admin (ou admin da plataforma); developer fica só com leitura. Upload de certificado já exige owner/admin no servidor e continua assim.
- Registros: `api_request_logs` ganha `company_id` (filtro na tela). Sanitizador recursivo remove `arquivo_base64`, `senha` e qualquer campo de segredo antes de gravar.

## 2. Rotas `/api/v1` (TanStack server routes)
Um núcleo compartilhado (`api.server.ts`) faz: autenticação pela chave (como `/status`), `X-Request-Id`, envelope de erro, idempotência, registro sanitizado com `company_id`, `waitUntil` para log e webhooks, e conversão de horários para `-03:00`.
- `empresas`, `empresas/$id` (GET/POST/PATCH/DELETE, filtros e paginação por cursor).
- `configuracao-fiscal` (GET/PUT): tradução texto legível ↔ códigos atuais (`nao_optante`=1, `mei`=2, `me_epp`=3; regimes; modos de tributos). Reusa os mesmos esquemas do painel (E0713, ISS do Simples) e o gatilho do banco; erros viram `422 REGRA_DE_NEGOCIO` com `detalhes` por campo.
- `certificado` (GET/POST): base64 até 100 KB, mesma chamada ao transmissor `/v1/certificados/preparar`, troca atômica e auditoria do painel (auditoria registra a integração). Códigos do transmissor traduzidos para os 6 do contrato. Arquivo e senha só em memória.
- `servicos` e `servicos/$servicoId` (GET/POST/PATCH, `ativo: false`, sem exclusão).
- `situacao` (GET) e `situacao/verificar-municipio` (POST, 1/min por empresa e ambiente → `429` + `Retry-After`, exige certificado válido).
- `catalogos/municipios|servicos|nbs`: reaproveitam as buscas sem acento existentes, 2+ caracteres, paginação.
- Toda leitura/escrita filtra pela organização da chave; empresa alheia → `404 NAO_ENCONTRADO`.

## 3. Situação e eventos
- Um cálculo único (`readiness.ts`) com os 5 itens do contrato, por ambiente; o painel passa a usá-lo (aba "Prontidão" renomeada para "Situação").
- Após cada alteração (API ou painel), verificação de município ou rotina diária: recalcula os dois ambientes e, se `pronta_para_emitir` mudou, emite `empresa.situacao_alterada` pelo `emitWebhookEvent` (com `company_id`, respeitando o filtro de empresa). Na API a primeira tentativa vai em segundo plano; no painel fica na fila do agendador.
- Rotina diária dentro de `/api/public/webhooks/process`: `certificado.vencendo` (30/15/7/1) e `certificado.vencido` com `dados` {empresa_id, id_externo, cnpj, valido_ate, dias_para_vencer}, reavaliação de situação e limpeza da idempotência. Os eventos são emitidos em cada ambiente com endereço ativo.

## 4. Painel
- Integrações: remover "todas / selecionadas" da criação e edição; texto "opera todas as empresas da organização".
- Empresa: selo "Alterado via API — integração X"; campo `id_externo` somente leitura; botão Desativar/Reativar; developer vê dados, configuração fiscal, serviços e certificado sem botões de alterar.
- Registro de requisições: filtro por empresa.

## 5. Documentação
`openapi.yaml` com todas as rotas, esquemas, exemplos e erros; `convencoes.md` (itens 1–3 acima, idempotência implementada); `webhooks.md` (dados dos 3 eventos); `empresas.md` só se você aprovar os ajustes 1–3.

## 6. Testes
Rotas com sucesso e erros do contrato; isolamento entre organizações; idempotência (repetição, conteúdo diferente, expiração); certificado (6 erros, sem segredo na resposta nem no registro); exclusão permitida e recusada; situação por ambiente; webhook de situação uma vez por mudança; rotina diária sem duplicar; permissões do developer pelo banco (SQL com reversão); catálogos sem acento.

## Ordem
Migração → núcleo da API e testes → rotas → situação/eventos/rotina → painel → documentação → publicação e chamada externa de verificação (sem chave e com chave de homologação, se você fornecer uma).

## Limites conhecidos
- Não consigo entrar no seu painel; telas ficarão "não verificadas" por mim.
- Sem um A1 real, o envio de certificado pela API será testado com o transmissor simulado.

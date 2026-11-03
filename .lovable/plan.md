# notem — Fase 2A (revisada): Certificado e convênio pelo transmissor

Substitui o plano anterior da 2A. Nada que dependa de Edge Functions. `transmissor/` não é tocado.

## 1. Segredos (somente servidor)
- `TRANSMISSOR_URL` e `GOOGLE_SERVICE_ACCOUNT_JSON`, pedidos pelo formulário seguro após a aprovação. Lidos só dentro dos handlers; nunca enviados ao navegador nem registrados.

## 2. Cliente do transmissor (módulo só de servidor)
- Token de identidade Google: JWT RS256 assinado com Web Crypto (chave PKCS#8 do JSON), claims `iss/sub` = e-mail da conta, `aud` = `https://oauth2.googleapis.com/token`, `target_audience` = `TRANSMISSOR_URL`, validade 1 h; troca por `id_token`. Cache em memória do Worker até 5 min antes de expirar (cache por instância; pode renovar mais vezes, sem impacto de segurança).
- Apenas `POST /v1/certificados/preparar` e `POST /v1/municipios/convenio`. Timeout 40 s (AbortController).
- Classificação de falhas: indisponível/timeout → "Serviço de transmissão indisponível"; 401/403 → "Credencial do painel com o transmissor inválida — contate o administrador" (detalhe só para admin da plataforma); 422/400 → códigos do LEIAME traduzidos.
- Nenhum log de corpo de requisição/resposta; erros registram apenas status e código.

## 3. Banco (migração; grants explícitos + RLS em todas)
- `company_certificates`: id, company_id, organization_id, holder, cnpj, issuer, serial_number, valid_from, valid_until, status (`active`|`replaced`), uploaded_by, created_at, replaced_at. Índice único parcial `(company_id) where status='active'`. SELECT para membros da organização e admin da plataforma; sem INSERT/UPDATE/DELETE para authenticated.
- `company_certificate_material`: company_id (PK), organization_id, key_version, nonce, data, updated_at. Grant só a `service_role`; RLS ativo sem políticas.
- `certificate_audit_events`: id, company_id, organization_id, user_id, action (`uploaded`|`replaced`|`used`|`failed`), purpose, environment, result, created_at. SELECT para owner/admin e admin da plataforma; escrita só servidor.
- `municipality_agreement_queries`: id, company_id, organization_id, municipality_ibge_code, environment (`production`|`sandbox`), requested_by, http_status, response_body (text), error_code, url, duration_ms, created_at. SELECT para membros; escrita só servidor.
- FKs para companies/organizations e verificação de que organization_id coincide com o da empresa (FK composta via índice único `companies(id, organization_id)`).
- Função `replace_company_certificate(...)`: executável só por `service_role`, transação única com `pg_advisory_xact_lock` por empresa — marca anterior `replaced`, insere novo `active`, faz upsert do envelope, grava auditoria (`uploaded` ou `replaced`). Falha = rollback, anterior intacto.
- Gatilho tornando `companies.organization_id` imutável (decisão já aprovada).

## 4. Funções de servidor (TanStack, `requireSupabaseAuth`)
Autorização sempre via `context.supabase` (`is_platform_admin` / `has_org_role(org, [owner, admin])`) e leitura da empresa pelo RLS do usuário; só então importar o cliente admin dentro do handler.
- `uploadCertificate` (POST, FormData): arquivo `.pfx`/`.p12` até 100 KB + senha + company_id/organization_id. Base64 em memória → `/preparar` com `cnpj_esperado` só dígitos → `replace_company_certificate` → devolve apenas metadados. Falha → auditoria `failed` com código, sem segredo.
- `getCertificates`: ativo + histórico (metadados).
- `checkAgreement`: lê envelope com cliente admin, ambiente do perfil (`sandbox`→`homologacao`, `production`→`producao`), chama `/convenio`, grava consulta e auditoria `used`/`failed`.
- `getAgreementQueries`: última consulta por ambiente; o painel mostra só a do ambiente atual.

## 5. Telas da empresa
- **Certificado:** titular, CNPJ, emissor, validade e situação ("Válido", "Vence em X dias" em âmbar com ≤30 dias, "Vencido"). Envio/Substituir só para owner/admin/admin da plataforma; demais veem metadados. Campo de senha sem autocomplete; arquivo e senha limpos ao concluir/cancelar; nada em cache de consulta ou storage. Histórico em tabela.
- **Prontidão:** item "Município atendido pelo emissor nacional" com botão "Verificar" (mesmos papéis). Mostra campos do Swagger `ParametrosConfiguracaoConvenio`: aderente ao emissor nacional, aderente ao ambiente nacional, situação de emissão padrão dos contribuintes RFB, aderente MAN, aproveitamento de créditos, tipo de convênio, `mensagem`, data e ambiente. "Detalhes técnicos" recolhível: URL, status HTTP, duração, corpo completo. Erros TLS/TEMPO_ESGOTADO/CONEXAO com mensagem clara.

## 6. Testes
- Regras em vitest: papéis que podem enviar/verificar (owner, admin, admin da plataforma sim; operator, viewer, developer não); situação do certificado nos limites 30/31 dias e vencido; tradução dos códigos do transmissor; mapeamento de ambiente; sanitização (respostas ao navegador nunca contêm `pfx_base64`, `senha`, `envelope`, `nonce`, `data`).
- Banco: authenticated sem acesso a `company_certificate_material`; outra organização não lê certificados/consultas; `organization_id` da empresa imutável; função de troca negada a authenticated.
- Testes das seis funções de autorização já aprovados.

## Fora do escopo
DPS, assinatura, emissão, cancelamento, outras consultas, rotação de chave.

## Conclusão
Só marcada como concluída com o A1 do Grupo Jota (Passo de Torres/SC, IBGE 4212254) enviado por você, metadados corretos e resposta real de homologação exibida e guardada. Sem `TRANSMISSOR_URL`, credencial ou certificado, declaro o bloqueio.

## Detalhes técnicos
- AGENTS.md: substituir a regra de Edge Functions por "certificados passam pelo Worker apenas em memória e são trancados/abertos exclusivamente pelo transmissor". Memória de certificados atualizada no mesmo sentido.
- Limite de corpo do Worker comporta 100 KB; validação de tamanho no navegador e no servidor.

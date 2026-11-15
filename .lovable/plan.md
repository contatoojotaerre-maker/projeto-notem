# Fase C — Parte 2: CNPJ alfanumérico

## Objetivo
Aceitar CNPJ alfanumérico (12 posições `[0-9A-Z]` + 2 DV numéricos) em todo o fluxo: cadastro, emissão, eventos, ADN, prova de posse, API, painel e DANFSe. CPF continua só numérico. Nada é enviado ao governo para teste.

## Regra única de CNPJ
- Normalização: remove máscara/pontuação e converte para maiúsculas (`12.abc.345/01de-35` vira `12ABC34501DE35`).
- Validação: valor de cada caractere = código ASCII − 48; pesos e módulo 11 iguais aos do CNPJ numérico; os dois DV são sempre números; 14 caracteres iguais continuam inválidos. Exemplo oficial `12ABC34501DE35` válido; qualquer DV trocado, inválido.
- Exibição: máscara `12.ABC.345/01DE-35` (mesmo desenho da numérica).
- A mesma regra existe em TypeScript e em SQL (`is_valid_cnpj` atualizado e nova `normalize_cnpj`), com testes iguais nos dois lados.

## Onde muda
- **Painel**: campo CNPJ da empresa, tomador PJ, intermediário, substituição (tomador), busca da lista de empresas e do seletor de empresas dos webhooks; campo passa a aceitar letras (teclado de texto, maiúsculas automáticas).
- **API**: `cnpj` de empresas, filtros `cnpj` e `prestador_cnpj`, documento do tomador/intermediário. Entrada com ou sem máscara e minúsculas é aceita e normalizada; respostas sempre com 14 caracteres maiúsculos sem máscara. Mensagens passam de "14 números" para "14 caracteres".
- **Emissão**: Id da DPS `DPS + município + 2 + CNPJ(14 alfanumérico) + série + número`; comparação "tomador = emitente" pela regra nova; leitura da NFS-e autorizada e conferência do CNPJ do prestador.
- **Chave de acesso e Ids**: chave com letras nas posições do CNPJ (10–23); Id da NFS-e, Id do pedido de evento e Id do evento seguindo os padrões do XSD release 1; extração do CNPJ do autor a partir da chave.
- **Eventos (cancelamento/análise/substituição)**: CNPJ do autor e checagem E0812 (raiz de 8 posições) aceitando letras.
- **Certificado**: `cnpj_esperado` enviado normalizado (transmissor v5 já aceita; confirmei a versão "5" no código, sem alterar a pasta).
- **ADN e prova de posse**: sincronização, cursores, notas externas/recebidas, visibilidade e listagem passam a comparar pelo CNPJ normalizado (hoje removem tudo que não é número, o que apagaria as letras).
- **DANFSe**: máscara alfanumérica no prestador/tomador/intermediário e link de consulta pública aceitando chave com letras.
- **Banco**: restrições de chave de acesso (`invoices`, `nfse_documents`, `nfse_document_events`), Id da DPS, cursor ADN e funções/políticas de prova de posse atualizadas para o formato alfanumérico. Os CNPJs atuais são todos numéricos e continuam válidos; a migração confere isso antes de trocar as regras.
- **Documentação**: OpenAPI e `docs/api/` (CNPJ: string de 14 posições alfanumérica; exemplos), nota interna e regras do projeto.

## Decisões para aprovar
1. **Leiaute antigo não aceita CNPJ com letras** (XSD de 09/02/2026: CNPJ, chave e Ids só numéricos). Proposta: em produção, antes da vigência da NT 009 (01/12/2026), qualquer nota com CNPJ alfanumérico (emitente, tomador ou intermediário) é recusada com 422 **antes da numeração**: "CNPJ alfanumérico só pode ser usado em produção a partir da vigência da NT 009 (dd/mm/aaaa)". Em homologação funciona sempre. Se a data for adiada depois de uma DPS montada no leiaute novo com CNPJ alfanumérico, a conversão para o antigo é recusada e o envio fica como "não realizado" (sem envio, sem ambiguidade).
2. **Defeito no XSD release 1 (chave de acesso)**: `TSChaveNFSe` = `[0-9]{6}([0-9A-Z]{14})[0-9]{30}` admite letras nas posições 7–20, mas o CNPJ ocupa 10–23 (como confirmam `TSIdNFSe`, `TSIdDPS` e `TSIdPedRegEvt` do mesmo arquivo). Com o exemplo oficial, a chave tem letra na posição 21 e falha nesse tipo. Ele é usado em `chSubstda` (substituição), `chNFSeRej`, `refNFSe` e `chNFSe`/`chSubstituta` dos eventos. Proposta: a notem valida a chave pela estrutura correta (9 dígitos + 14 alfanuméricos + 27 dígitos); nos testes, correção em memória só desse tipo (o arquivo em `docs/referencias/rtc/` continua intacto), documentada como defeito oficial; substituição e cancelamento não são bloqueados. Vale conferir no seu validador independente.
3. **API tolerante à máscara**: aceitar CNPJ com máscara e minúsculas (hoje exige 14 números sem máscara). É mais permissivo, sem quebrar integrações existentes.

## Testes
- DV válido/inválido (exemplo oficial, DV trocado, letra no DV, caracteres repetidos, minúsculas e máscara) em TS e SQL.
- Cadastro de empresa e tomador pelo painel/API com CNPJ alfanumérico; filtro da API.
- Emissão em homologação com emitente e tomador alfanuméricos: DPS validada no XSD release 1; bloqueio em produção antes da vigência; conversão recusada para o leiaute antigo.
- Leitura de NFS-e e eventos com chave com letras (ADN, NFS-e autorizada, DANFSe); prova de posse e "Notas recebidas" com CNPJ alfanumérico; isolamento entre organizações mantido.
- Substituição e pedido de cancelamento com chave alfanumérica validados no XSD (com a correção do item 2).
- Suíte completa, OpenAPI 3.1, typecheck/build.

## Fora desta parte
IBS/CBS (Parte 3). Nenhuma alteração em `transmissor/`. Sem envio real ao governo.

## Detalhes técnicos
- `src/lib/notem.ts`: `normalizeCnpj`, `isValidCnpj` (ASCII−48), `formatCnpj`; `digits` continua para CPF/CEP/telefone.
- Arquivos afetados (principais): `api-contract.ts`, `api-companies.server.ts`, `api-received.server.ts`, `customers.ts`, `dps.ts`, `dps-layout.ts` (recusa de conversão), `invoices.server.ts`, `nfse-xml.ts`, `adn-xml.ts`, `fiscal-events.ts`, `fiscal-events.server.ts`, `notes.server.ts`, `adn-sync-request.server.ts`, `certificates.functions.ts`, `danfse.ts`, componentes de empresa/tomador/substituição/webhook, `docs/api/openapi.yaml`.
- Migração: `normalize_cnpj` imutável; `is_valid_cnpj` novo; checks `^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$` (chave), `^DPS[0-9]{7}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}$` (Id DPS), `^[0-9A-Z]{12}[0-9]{2}$` (cursor); `list_org_notes`, `org_proven_cnpj`, `request_adn_sync` e políticas `adn_cursor_read`/`nfse_documents_read` usando `normalize_cnpj`; revogações/concessões mantidas como hoje.

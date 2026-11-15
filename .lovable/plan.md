# Fase 7 — Ajustes antes da Parte 2 (sincronização manual, XML em arquivos, verificação diária)

Nada em `transmissor/` será tocado. A Parte 1 já publicada é ajustada; depois sigo as Partes 2 e 3 revisadas, numa única entrega, e publico ao final.

## 1. Sincronização manual por empresa (substitui a automática)

**O que deixa de existir**
- A rotina de 1 minuto deixa de iniciar consultas por NSU. Nenhum CNPJ é consultado sem um pedido feito no painel.
- A rotina de 1 minuto apenas **continua, em lotes, uma sincronização que alguém pediu**, até terminar (uma consulta de 24 meses pode ter milhares de NSUs e não cabe num clique). Ao terminar, ela para.
- O estado atual da Group Jota (já sincronizada até o NSU 13) é preservado.

**Opções no painel (Empresa → Sincronização)**
- "Novidades desde a última sincronização": continua do último NSU recebido.
- "Últimos 1, 3, 6, 12 ou 24 meses": a notem localiza o primeiro NSU do período pela data de geração (`DataHoraGeracao`), por busca em etapas, e importa a partir dele.
- O que já foi importado não é baixado de novo: a sincronização por período só busca os trechos que faltam e depois segue para as novidades.
- Por ambiente (produção e homologação), cada um com seu botão.

**Intervalo do ADN**
- Depois de uma consulta sem documentos novos, nenhuma consulta daquele CNPJ e ambiente por 1 hora (qualquer opção). Botão desativado com contagem regressiva.
- Erros mantêm a espera crescente atual; "consumo indevido" nunca menos de 1 hora.
- O controle é por CNPJ: se duas organizações têm o mesmo CNPJ, o intervalo e a sincronização em andamento valem para ambas ("Sincronização em andamento").

**Permissão (conferida no servidor)**
- Sincronizar: proprietário e administrador da organização e administrador da plataforma. Demais papéis só veem a situação.
- A empresa precisa ter prova de posse (certificado atual ou anterior) para sincronizar, como já vale para ver notas externas e recebidas.
- "Atualizar com o governo" no detalhe da nota continua como aprovado (proprietário, administrador, operador e administrador da plataforma; 1 vez a cada 5 minutos por nota).

**API**
- Não há rota de sincronização. `GET /empresas/{id}/sincronizacao` continua só como consulta de situação, no ambiente da chave: situação, último NSU, última consulta, próxima consulta permitida, andamento da sincronização pedida e último erro.

## 2. XML compactado em armazenamento privado

- **Armazenamento**: bucket privado (sem acesso pelo navegador, sem regras de leitura para usuários); só o servidor grava e lê.
- **Formato**: cada XML compactado (gzip), com tamanho original e impressão digital (SHA-256) guardados na tabela. Ao ler, a notem confere a impressão digital antes de entregar; o XML devolvido é byte a byte o original.
- **Nas tabelas fica só**: dados de listas, filtros e detalhes, mais o caminho do arquivo, tamanho e impressão digital.
- **Quais XML**: nota autorizada, DPS assinada e não assinada, tentativas retidas (E0014), eventos pedidos pela notem (pedido, assinado e evento oficial), notas e eventos vindos do ADN.
- **Sem duplicar**: nota da notem que também chega pelo ADN com conteúdo idêntico usa o mesmo arquivo.
- **Ordem segura na emissão e nos eventos**: o arquivo é gravado antes de qualquer envio ao governo. Se a gravação falhar, nada é enviado e a nova tentativa segue pelas regras atuais (o número reservado continua definitivo).
- **Migração dos XML já guardados** (12 notas e 1 evento do ADN, a nota nº 11 com DPS e evento de cancelamento): copiar cada um para o armazenamento, baixar de volta e conferir byte a byte; só então limpar o texto da tabela. Por fim, removo as colunas de XML (esta etapa pede sua aprovação no banco). Relato antes e depois com quantidades e espaço.
- Downloads de XML/PDF na API e no painel e o DANFSe passam a ler do armazenamento, sem mudança no contrato.

## 3. Verificação automática diária (opção A)

- Uma vez por dia, consulta `POST /v1/adn/eventos` **somente** para notas emitidas pela notem com operação pendente (cancelamento em análise ou em verificação).
- Aplica os eventos com as regras atuais (sem retrocesso) e envia os webhooks pela fila existente.
- Cada nota no máximo uma vez por dia, com limite por ciclo; o que não couber segue nos ciclos seguintes do mesmo dia.
- A reconciliação já existente de cancelamento recusado por evento existente (E0840 e equivalentes, no máximo 1 vez por hora por nota) continua.

## Parte 2 revisada — API e documentação
- `origem` na nota (`notem` | `externa`) e filtro em `GET /notas`; externas com detalhe, XML, PDF e XML de eventos; cancelar/substituir externa → `409 CONFLITO`.
- Notas recebidas: `GET /empresas/{id}/notas-recebidas` (filtros período, situação e prestador), detalhe, XML e PDF.
- `GET /empresas/{id}/sincronizacao` só leitura, campos acima.
- `docs/api/sincronizacao.md`: sincronização manual pelo painel, opções de período, intervalo de 1 hora, verificação diária das notas com cancelamento pendente, e que outros eventos posteriores (análises, manifestações, ações da prefeitura em notas sem pendência) só aparecem após sincronização manual ou "Atualizar com o governo". Também `notas.md`, `LEIAME.md`, webhooks e OpenAPI 3.1 validado.

## Parte 3 revisada — Painel
- Notas: selo "Emitida fora da notem", filtro por origem, detalhe externo só leitura com XML e PDF.
- Empresa → Sincronização: por ambiente, situação, último NSU, última e próxima consulta, documentos importados, andamento e último erro; seletor de opção, botão com contagem regressiva; sem botão para quem não tem permissão.
- Empresa → Notas recebidas: lista com filtros e detalhe só leitura, XML e PDF.
- Detalhe da nota: "Atualizar com o governo".

## Testes
- Sincronização: nada roda sem pedido; continuação em lotes até terminar; intervalo de 1 hora para qualquer opção; permissões no servidor (operador recusado); busca do NSU inicial por data com respostas simuladas; trechos já importados não são baixados de novo.
- Armazenamento: compactar/descompactar idêntico, impressão digital conferida, falha de gravação impede o envio, migração conferida byte a byte, downloads e DANFSe iguais aos de antes.
- Verificação diária: só notas da notem com pendência, uma vez por dia, eventos aplicados e webhooks únicos.
- Banco: testes com desfazimento, sem alterar a nota real.

## Pontos para sua decisão
1. **Primeira sincronização de um CNPJ**: "Novidades" não tem ponto de partida. Recomendo mostrar só os períodos até a primeira sincronização (padrão 1 mês). Alternativa: "Novidades" = todo o histórico desde o NSU 0.
2. **Busca do NSU inicial**: o ADN não consulta por data, então cada etapa da busca é uma consulta (até cerca de 20). Uso o último NSU conhecido como limite para evitar consultas além do fim; num CNPJ nunca sincronizado, algumas etapas podem voltar sem documentos. Proponho que essas etapas não acionem a espera de 1 hora, mas que qualquer aviso de consumo indevido interrompa a busca. Não verificado: como o ADN reage a várias consultas seguidas.
3. **Homologação**: com a sincronização manual, proponho permitir o botão também em homologação, mesmo sem notas de homologação na notem.

## Detalhes técnicos
- **Banco**: o cursor ganha pedido de sincronização (tipo, período, NSU inicial encontrado, quem pediu, quando) e faixas de NSU já importadas; `claim_adn_cursors` passa a reservar só cursores com pedido em aberto. Permissão conferida por função autenticada antes do RPC só de serviço, padrão das integrações.
- **Clique**: função de servidor autenticada registra o pedido, faz a busca do NSU inicial e os primeiros lotes dentro do tempo do clique; o Cloud Scheduler continua o restante pela reserva com lease.
- **Arquivos**: bucket privado `fiscal-xml` criado pela ferramenta de armazenamento; caminhos determinísticos por ambiente/chave/código/sequência ou por nota; gzip com `CompressionStream` no Worker; leitura pelo cliente de serviço só no servidor. Os RPCs continuam recebendo o XML quando precisam validar conteúdo (ex.: `chNFSe` no pedido), mas gravam só caminho, tamanho e SHA-256.
- **Diária**: aproveita a rotina diária existente do ciclo, com marca de última verificação por nota e `touch_nfse_refresh`.
- **Regras técnicas**: substituo em `src/lib/AGENTS.md` a regra de sincronização automática e acrescento a do armazenamento de XML; memória do projeto atualizada com as novas decisões.

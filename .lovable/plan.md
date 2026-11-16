# Fase 8: painel da organização

Sem emissão pelo painel. Não serão alterados `transmissor/`, as regras fiscais, o leiaute da DPS nem a emissão e o cancelamento. Tudo respeita a organização e o ambiente selecionado (salvo no perfil, como hoje).

## Decisões propostas (confirme ou ajuste)

1. **Período: data de emissão** (`dhEmi`) para todos os números do Início, no horário de Brasília e por dias inteiros.
   - Mês atual: dia 1 até hoje.
   - Mês anterior: o mês fechado.
   - Últimos 30 dias: hoje e os 29 dias anteriores.
   - Texto abaixo dos números: "Notas emitidas no período, pela data de emissão (horário de Brasília)."
2. **Valor total emitido:** soma do valor do serviço das notas autorizadas, incluindo as que estão com cancelamento em análise (continuam válidas até a decisão). Ficam fora as canceladas, as canceladas pela prefeitura e as substituídas.
3. **Canceladas no período:** notas emitidas no período que hoje estão canceladas, pela mesma regra de data. A alternativa seria contar pela data do cancelamento, o que exige uma segunda regra no texto.
4. **Fora da notem:** notas sincronizadas em que o prestador é uma empresa da organização com prova de posse (regra da Fase 7). Notas recebidas não entram no Início. Notas da notem que também chegam pela sincronização não são contadas duas vezes.
5. **CSV:** limite de **10.000 notas por planilha**. Acima disso, o painel não gera um arquivo cortado: mostra "O filtro tem N notas; o limite por planilha é 10.000. Reduza o período."
6. **ZIP:** a recomendação é a **opção A**.
   - **Opção A (recomendada):** montagem no navegador, em partes.
     - Limite de **500 notas por ZIP** (cerca de 60 MB com XML e PDF).
     - O navegador pede os arquivos em lotes de 20 notas a funções do servidor que exigem login. Cada lote confere de novo a organização e a prova de posse, e o ZIP é montado no próprio navegador, com barra de progresso.
     - Nenhum servidor ultrapassa o tempo limite, e nenhum arquivo fica guardado: não há link, porque não existe arquivo no servidor para expirar.
     - Se a aba for fechada, o download para.
   - **Opção B:** geração em segundo plano.
     - Precisa de uma tabela nova de exportações, um bucket privado, processamento pelo agendador a cada minuto em várias etapas, aviso no painel e link assinado de 15 minutos.
     - É mais complexa e mais lenta (minutos), e exige montar o ZIP em partes no servidor.
   - Nas duas opções, acima de 500 notas o painel pede para reduzir o filtro.
7. **PDF de nota de fora:** hoje o painel **já gera o DANFSe** das notas de fora e das recebidas a partir do XML oficial, então o ZIP inclui esse PDF. O PDF das notas da notem também é gerado na hora (não fica guardado), com a situação atual.
8. **Gravidade dos alertas:**
   - Impeditivo: certificado vencido; empresa ativa sem condição de emitir; IBS/CBS a partir de 01/01/2027.
   - Atenção: certificado vencendo em até 7 dias; IBS/CBS antes de 01/01/2027; nota em verificação há mais de 30 minutos; cancelamento aguardando o governo há mais de 24 horas; erro na sincronização com o ADN; falha de webhook.
   - Informativo: certificado vencendo em 15 ou 30 dias.

## O que será feito

### 1. Início
- **Empresas:** total, ativas e inativas, prontas para emitir e com pendência. A prontidão usa o mesmo cálculo da aba "Pronta para emitir", feito no servidor para todas as empresas de uma vez.
- **Notas do período**, com seletor (mês atual é o padrão): emitidas (total, pela notem e fora da notem), valor total (com a mesma separação), canceladas e rejeitadas (só da notem). Valores em reais com duas casas.
- **Pendências:** os 5 alertas mais graves, cada um com link para resolver, e "Ver todos os alertas". Sem pendências, aparece "Tudo em dia".
- **Últimas 10 notas:** número, empresa, tomador, valor, situação, origem e data. Cada linha abre o detalhe da nota.
- **Sem empresas:** estado vazio com "Cadastrar empresa", só para quem pode cadastrar.
- Todos os perfis da organização veem o Início.

### 2. Notas
- **Busca única:**
  - número da nota;
  - chave de acesso (50 caracteres);
  - documento do tomador (CPF, CNPJ numérico ou alfanumérico, com ou sem pontuação, maiúsculas ou minúsculas; NIF);
  - nome parcial do tomador, sem diferenciar acentos nem maiúsculas.
- **Período:** filtro por emissão ou competência, com mês atual, mês anterior, últimos 30 dias ou intervalo personalizado, somado aos filtros de empresa, origem e situação.
- **Exportar CSV:**
  - separador `;`, UTF-8 com BOM, vírgula decimal e datas `dd/mm/aaaa`;
  - colunas pedidas no briefing; a "série" é a série da DPS, a única que a nota tem;
  - proteção contra fórmula para células que começam com `= + - @`, tab ou retorno.
- **Baixar ZIP:**
  - o usuário escolhe XML, PDF ou os dois, sempre com os filtros aplicados;
  - organização em pastas: `{CNPJ}/NFSe_{numero}_{chave}.xml`, `NFSe_{numero}_{chave}.pdf` e `Cancelamento_{numero}_{chave}.xml` (XML oficial do evento).
- **Permissão:** quem já vê as notas.
- **Registro:** cada exportação é registrada na trilha de auditoria existente, com tipo, filtros, quantidade, quem e quando, sem o conteúdo.

### 3. Modelos de serviço
O item sai do menu, e o endereço antigo leva ao Início, sem erro.

### 4. Alertas
- **Uma única fonte**, que alimenta a tela Alertas, as Pendências do Início e o contador ao lado do menu (atualizado a cada minuto).
- **Calculados na hora** (somem sozinhos quando o problema é resolvido):
  - certificado vencendo ou vencido, pela validade do certificado ativo; os marcos de `certificate_expiry_notices` continuam servindo aos webhooks;
  - empresa ativa sem condição de emitir, com o motivo;
  - IBS/CBS pendente em serviço ativo;
  - nota em verificação há mais de 30 minutos;
  - cancelamento aguardando o governo há mais de 24 horas;
  - erro na última sincronização da empresa.
- **Guardados:** falhas de webhook, já gravadas hoje. Ficam abertas enquanto o endpoint continuar desativado ou sem entrega bem-sucedida depois do alerta; as antigas vão para "Histórico".
- **Filtros:** por gravidade e por empresa.
- **Datas:** no horário de Brasília. Hoje a tela usa o horário do navegador; isso será corrigido.

### 5. Ajuda
- **Passo a passo:** 8 passos curtos, cada um com link para a tela correspondente.
- **Documentação da API:** o bloco fica oculto até a Fase 10.
- **Suporte:** e-mail e WhatsApp numa seção nova "Suporte" da Administração, editável só pelo administrador da plataforma e registrada na auditoria. Se estiver vazio, o bloco não aparece. Não vou inventar contato.

### 6. Nomes e menu
- A aba "Situação" passa a se chamar "Pronta para emitir".
- Ordem do menu: Início, Notas, Empresas, Alertas, Integrações, Equipe, Organização, Ajuda.
- Ao abrir uma organização, a primeira tela já é o Início.

## Detalhes técnicos

- **Sem tabelas novas** na opção A. Mudanças no banco:
  - duas colunas em `platform_settings` (`support_email`, `support_whatsapp`), com verificação de formato, mais uma função só para o administrador da plataforma, com auditoria;
  - `list_org_notes` ganha `_search` e `_date_field` (emissão ou competência), mantendo a prova de posse;
  - função nova `org_notes_summary(_org,_env,_from,_to)`, no mesmo padrão de quem chama (RLS do próprio usuário), que conta e soma no banco os valores de `sent_values`/`summary`.
- **Índices novos:**
  - `invoices`: `(organization_id, environment, competence)`, `(organization_id, environment, nfse_number)`, `(environment, access_key)`, `(organization_id, environment, (customer_snapshot->>'documento'))` e índice de trigramas no nome normalizado do tomador;
  - `nfse_documents`: `(environment, provider_cnpj, competence)`, `(environment, provider_cnpj, nfse_number)` e índice de trigramas em `taker_name`.
  - Continuam em uso `invoices_list`, `nfse_documents_provider_idx`, `nfse_documents_taker_idx` e a chave única por ambiente.
- **Funções do servidor** (com login, `requireOrgMember` e tudo filtrado pela organização):
  - `getOrgDashboard`, `getOrgAlerts` (lista e contagem), `exportInvoicesCsv` e `getExportFiles` (lote de 20 notas);
  - os alertas e a prontidão usam leituras em lote (cerca de 7 consultas por organização) e o cálculo puro `computeReadiness`, já usado hoje.
- **ZIP:** biblioteca `fflate` (MIT), na versão estável com pelo menos duas semanas, travada exata.
- **Formatação:** um módulo único para moeda e datas de Brasília, usado pelas telas novas e pelo CSV.
- **Auditoria das exportações:** `admin_audit_events` com `action='notas.exportacao_csv'` ou `'notas.exportacao_zip'` e `details` sem dados das notas.

## Testes
- **Início:** os números são conferidos com uma consulta independente nos 3 períodos e nos 2 ambientes, com notas de fora, canceladas, rejeitadas e substituídas.
- **Busca:** número, chave, CNPJ com e sem pontuação, CNPJ alfanumérico, CPF e nome parcial com acento.
- **CSV:** BOM, separador, decimais, datas, acentos, proteção contra fórmula e limite.
- **ZIP:** pastas, eventos de cancelamento, filtros, limite e recusa de notas de outra organização no lote.
- **Alertas:** cada tipo aparece no cenário certo e some quando resolvido.
- **Isolamento:** a matriz ganha as funções novas (resumo, busca, alertas, exportação e suporte). Usuário de outra organização recebe 0 registros ou 404. Trago o total (hoje 1.495) e as falhas.
- **Regras gerais:** os 587 testes, a verificação de tipos e a montagem.

## Prints
O banco do projeto não permite que eu entre no painel com login. Para os prints em produção e homologação, preciso que você me passe um usuário de teste pelo formulário seguro (e-mail e senha), membro de uma organização de teste. Sem isso, entrego os testes automáticos e marco os prints como não verificados.

## Fora desta fase
Administração (Fase 9), documentação pública (Fase 10), e-mails de alerta e gráficos. Não publico antes da sua aprovação.

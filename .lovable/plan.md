# Emissão de NFS-e — etapa E1

## Plano para aprovação — cinco partes
Aguardar aprovação antes de implementar/publicar; nenhuma alteração em transmissor/.

**Fontes:** contratos notas/transmissor v2 pelo anexo autorizado; convenções, empresas, webhooks e Anexo I/XSD **1.01**. Sincronização da main não verificada.

## Decisões incorporadas
CNPJ = **2** no Id DPS; repetição durante processamento/verificação = **202 com a nota atual**, corpo diferente = 409; falhas ambíguas = verificação. Só considerar não enviada em DNS/conexão recusada antes do transmissor, 401/403 Google antes do serviço ou 4xx de validação própria com código. fast-xml-parser sem entidades externas e lxml nos testes aprovados. Exclusão de empresa confere também notas.

## Complementos do contrato propostos nesta aprovação
1. **Endereço estrangeiro:** o contrato oferece país/cidade/endereço livre/código postal, mas o XSD exige também estado/província/região e logradouro/número/bairro. Acrescentar `estado_provincia_regiao`, `logradouro`, `numero`, `bairro`, `complemento` opcional; manter `endereco_livre` como alternativa ao logradouro. Quando houver endereço, exigir os dados oficiais faltantes, sem inventar “S/N”, bairro ou província. Sem endereço, omitir o grupo opcional. Documentar e testar antes de numerar.
2. **Motivo sem NIF:** definir `motivo_sem_nif` como `dispensado` → código 1 ou `nao_exigido` → código 2; não oferecer código 0, destinado a notas de origem. NIF e motivo são alternativas exclusivas.
3. **Erros de governo:** ampliar os itens de `detalhes` da emissão com `codigo_governo`, `mensagem_governo`, `complemento` e `nota_id`, mantendo `campo`/`mensagem` do envelope. Mensagem amigável baseada na tabela oficial; preservar descrição original e usar mensagem genérica quando não houver tradução confirmada. 403 do **governo** rejeita por certificado; não confundir com 403 anterior ao serviço.
4. **PDF nesta etapa:** documentar expressamente a exceção E1: `503 GOVERNO_INDISPONIVEL`, mensagem **“PDF em preparação”**, sem produzir arquivo provisório; PDF oficial fica para E2.
5. **Durabilidade da emissão:** manter a associação chave/hash/nota além da limpeza de 24 h do cache genérico, impedindo duplicação de uma nota já registrada quando a chave for repetida depois. GET da nota é a fonte de estado; replays terminais preservam o resultado da emissão, e processamento/verificação retornam estado atual. Chaves de emissão já associadas não podem ser reutilizadas para outra nota.

## Divisão proposta e ordem

### Parte 1 — Contratos, persistência e tomadores
- Fechar a matriz pedido → campos da DPS → resposta da nota → resultados do transmissor com os contratos já lidos. Resolver empresa/serviço por id ou id_externo e tomador inline/id/id_externo; recusar alternativas simultâneas e referências de outra empresa/organização.
- Criar invoices, invoice_events e company_customers. Copiar tomador/serviço/configuração na emissão; sem notas fictícias.
- Separar situação pública do controle de envio/verificação; cancelamento reservado conforme contrato.
- Notas: `external_id` único por organização; tomadores: `external_id` único por empresa. Vínculos compostos garantem empresa e integração da mesma organização.
- RLS organizacional, concessões explícitas em cada tabela; escrita de notas e eventos somente pelo servidor. Tomadores: API autorizada e painel somente leitura nesta etapa.
- Reutilizar a reserva definitiva existente, com exclusão de empresa passando a conferir também a existência de notas em ambos os ambientes.
- Implementar GET/POST/PATCH de tomadores, com validações nacionais/exterior e isolamento por empresa, conforme o objeto do contrato e os complementos acima.

### Parte 2 — Montagem e leitura XML
- Montador próprio e puro da DPS v1.01, sem assinatura, com ordem dos elementos do XSD, namespace, versão, UTF-8 e escape de caracteres.
- Identificador de 45 caracteres, série com 5 dígitos e número com 15 no identificador; preservar números grandes como texto, sem perda de precisão.
- Competência padrão = data atual de São Paulo, sem data futura; descrição padrão do serviço ativo, até 2.000 caracteres; informações complementares até 2.000; descontos padrão zero e validação de valores antes de numerar. Retenção/alíquota do pedido substituem os padrões somente nas combinações permitidas.
- Ambiente somente pela chave; `dhEmi` com `-03:00`; prestador, tomador opcional/PF/PJ/estrangeiro, serviço/local, descontos e tributos conforme referência.
- Aplicar E0621/E0625 e E0713 antes da reserva sempre que validáveis: alíquota do ISS somente quando permitida; não optante exige percentuais por esfera e não contém `indTotTrib`/`pTotTribSN`.
- Sem IBS/CBS nem intermediário. Conferir no contrato o comportamento de pedidos que exijam esses grupos, sem omitir informações obrigatórias silenciosamente.
- Salvar três exemplos sem assinatura em `docs/exemplos/dps/`, com dados fictícios identificados: ME/EPP sem retenção com PJ, não optante com PF, estrangeiro.
- Leitura segura do XML autorizado por namespace, sem DTD/entidades externas: número, chave, datas e valores governamentais, mantendo o XML recebido.

### Parte 3 — Emissão segura e idempotência
- `POST /api/v1/notas` exige Idempotency-Key; validar pedido e prontidão pelo cálculo compartilhado antes de numerar.
- Persistir a associação entre chave, hash e nota, com controle concorrente e recuperação; vincular a reserva ao pedido antes de nova tentativa. Falha entre reserva e registro deixa lacuna, nunca devolução/reutilização. Repetição não cria nova nota nem reserva outro número.
- Reservar definitivamente, guardar nota e DPS sem assinatura para reenvio idêntico; registrar transições seguras na linha do tempo.
- Chamar `/v1/nfse/emitir` com organização/empresa/envelope/ambiente, `dps_xml`, `algoritmo_assinatura: rsa-sha256` e `tempo_limite_segundos: 18`; preservar `dps_assinada` e interpretar `resposta.status`, `corpo_json`/`corpo_texto` ou `erro`. Limitar a espera total; autenticação/rede podem exceder os cerca de 20 segundos; ele assina e transmite. Auditar o uso do certificado sem material secreto.
- Tratar 201 autorizado, 400 rejeitado, 403 certificado, 500/timeout/conexão após envio em verificação, conforme o brief e o contrato, com erros por campo e nota_id.
- Só reenviar diretamente quando houver evidência contratual de que não houve envio; falha ambígua vai para verificação para evitar duplicação. Uma conexão interrompida com o transmissor não prova que ele não enviou ao governo.
- Transição e webhook atômicos/recuperáveis, sem duplicação; nota.autorizada/rejeitada com nota completa e escopo correto.
- Primeira entrega de webhook pela API em segundo plano quando disponível; sem isso, fila persistida para o agendador, sem erro nem perda.

### Parte 4 — Verificação e consultas
- Agendador OIDC existente a cada minuto, preservando webhooks; lotes limitados e leases contra consultas concorrentes.
- Consultar DPS após mais de 1 minuto em verificação; chave encontrada → consultar NFS-e → autorizar e emitir evento uma única vez.
- 404: repetir; após 15 minutos sem geração, rejeitar com “O governo não gerou esta nota”. Falhas de conexão não contam como prova de ausência.
- GET lista/detalhe/XML com filtros `empresa_id`, `empresa_id_externo`, `situacao`, `id_externo`, `tomador_documento`, `emitida_de`, `emitida_ate` e paginação por cursor; XML somente autorizado, demais casos 404.
- PDF: sempre 503 com “PDF em preparação”, no envelope/código definido no contrato, sem PDF provisório.
- Consulta pública: procurar fonte oficial confiável; se não confirmada, `links.consulta_publica = null`.

### Parte 5 — Painel, documentação e publicação
- Notas somente leitura: filtros empresa/situação/período/ambiente; resumo, tomador, valores, rejeições em português e linha do tempo. Detalhes técnicos e download XML protegidos por organização.
- Aba Tomadores por empresa, lista/detalhe; developer/viewer somente leitura. Preservar marca e domínio oficial; novas páginas com metadados próprios.
- Atualizar openapi, notas, webhooks (objeto completo sem XML/PDF), convenções, agendador e exemplos curl; decisões estruturais no AGENTS.md.
- Publicar após aprovação e testes; emissão real pelo proprietário.

## Detalhes técnicos e testes
- Módulos separados de esquemas, montagem/leitura XML, persistência/transições, transmissor e verificação; API usa `apiRoute`. Produção: fast-xml-parser sem DTD/entidades externas, nenhum validador nativo.
- Testes XSD: Python lxml/libxml2, usando só 1.01 do ZIP oficial, includes/imports locais sem rede; manter teste no projeto.
- Montador: Id/CNPJ=2, série/número sem perda, ambiente, fuso, caracteres especiais, tomador ausente/PF/PJ/estrangeiro, regras pAliq e E0713, valores decimais exatos; XML inválido deve falhar.
- Transmissor simulado: 201/400/403/500, timeout, falha comprovadamente anterior ao envio e ambiguidade; idempotência com conteúdo diferente, concorrência, repetição durante processamento/verificação e mesmo número/DPS após 503.
- Verificação: chave+XML, 404 antes/depois de 15 minutos, conexão falhando, transição e webhook sem duplicação.
- Banco com reversão: grants/RLS, isolamento, unicidade por escopo, reserva definitiva e exclusão com notas. Concorrência real depende de conexão de teste adequada.
- Emissão real não é comprovada por simulação. Sem sessão de teste, telas autenticadas serão declaradas “não verificadas”.

## Entregas e critério de conclusão
Cada parte entrega testes/documentação. Ao final: rotas, três DPS validadas, painel de leitura, verificações/webhooks e publicação. Primeira emissão real pelo proprietário; transmissor/ intocado.

**A aprovação inclui os cinco complementos de contrato acima.** Se algum não for aceito, revisar esse trecho antes da implementação. O estrangeiro é um tipo de tomador, não implica automaticamente serviço de exportação; operações que precisem de grupos fiscais não contemplados em E1 serão recusadas previamente com campo e motivo específicos.

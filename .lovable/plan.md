# Emissão de NFS-e — etapa E1

## Plano final para aprovação — cinco partes
Nenhuma implementação, migração ou publicação será feita antes da aprovação. Nada dentro de `transmissor/` será criado, editado, movido ou apagado.

**Fontes conferidas:** contrato de notas e LEIAME do transmissor v2 pelo anexo autorizado como fonte até a sincronização normalizar; convenções, empresas e webhooks do projeto; Anexo I e XSD **1.01**. A sincronização com a main continua não verificada; não é necessária para planejar com o anexo.

## Decisões incorporadas
- **Identificador DPS:** CPF = 1, **CNPJ = 2**, com 45 caracteres, conforme o Anexo I. O XSD original permite DPS sem assinatura.
- **Idempotência específica de POST /notas:** repetição durante processamento/verificação devolve **202 com o estado atual da nota**, não 409; corpo diferente continua 409. Outras rotas mantêm seu comportamento.
- **Não enviada comprovadamente:** apenas falha DNS/conexão recusada antes de chegar ao transmissor, 401/403 Google antes do serviço ou validação própria do transmissor (4xx com código). Qualquer falha ambígua vai para verificação; nunca recebe outro número.
- **Ferramentas aprovadas:** fast-xml-parser com entidades externas recusadas em produção; Python lxml para validar XSD nos testes.
- **Exclusão de empresa:** passa a conferir notas, além da numeração usada.

## Complementos do contrato propostos nesta aprovação
1. **Endereço estrangeiro:** o contrato oferece país/cidade/endereço livre/código postal, mas o XSD exige também estado/província/região e logradouro/número/bairro. Proposta: acrescentar `estado_provincia_regiao`, `logradouro`, `numero`, `bairro` e `complemento` opcional ao endereço estrangeiro; manter `endereco_livre` e usá-lo como logradouro quando este não vier. Quando houver endereço, exigir os dados oficiais faltantes, sem inventar “S/N”, bairro ou província. Sem endereço, omitir o grupo opcional. Documentar e testar antes de numerar.
2. **Motivo sem NIF:** definir `motivo_sem_nif` como `dispensado` → código 1 ou `nao_exigido` → código 2; não oferecer código 0, destinado a notas de origem. NIF e motivo são alternativas exclusivas.
3. **Erros de governo:** ampliar os itens de `detalhes` da emissão com `codigo_governo`, `mensagem_governo`, `complemento` e `nota_id`, mantendo `campo`/`mensagem` do envelope. Mensagem amigável baseada na tabela oficial; preservar descrição original e usar mensagem genérica quando não houver tradução confirmada. 403 do **governo** rejeita por certificado; não confundir com 403 anterior ao serviço.
4. **PDF nesta etapa:** documentar expressamente a exceção E1: `503 GOVERNO_INDISPONIVEL`, mensagem **“PDF em preparação”**, sem produzir arquivo provisório; PDF oficial fica para E2.
5. **Durabilidade da emissão:** manter a associação chave/hash/nota além da limpeza de 24 h do cache genérico, impedindo duplicação de uma nota já registrada quando a chave for repetida depois. GET da nota é a fonte de estado; replays terminais preservam o resultado da emissão, e processamento/verificação retornam estado atual. Chaves de emissão já associadas não podem ser reutilizadas para outra nota.

## Divisão proposta e ordem

### Parte 1 — Contratos, persistência e tomadores
- Fechar a matriz pedido → campos da DPS → resposta da nota → resultados do transmissor com os contratos já lidos. Resolver empresa/serviço por id ou id_externo e tomador inline/id/id_externo; recusar alternativas simultâneas e referências de outra empresa/organização.
- Criar `invoices`, `invoice_events` e `company_customers`, sem notas de demonstração. Notas guardam snapshots de tomador, empresa/configuração necessária e serviço para não mudar com edições posteriores.
- Guardar estados públicos separados dos controles internos de envio, tentativas e verificações; definir estados reservados de cancelamento apenas conforme o contrato.
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
- Persistir a associação entre chave, hash e nota, com proteção concorrente e recuperação após interrupção; coordenar reserva e registro para que o número reservado fique vinculado ao pedido antes de nova tentativa. Uma reserva sem registro concluído pode deixar lacuna, mas nunca ser devolvida ou reutilizada. Não permitir duas emissões para o mesmo pedido nem reservar outro número na repetição.
- Reservar definitivamente, guardar nota e DPS sem assinatura para reenvio idêntico; registrar transições seguras na linha do tempo.
- Chamar `/v1/nfse/emitir` com organização/empresa/envelope/ambiente, `dps_xml`, `algoritmo_assinatura: rsa-sha256` e `tempo_limite_segundos: 18`; preservar `dps_assinada` e interpretar `resposta.status`, `corpo_json`/`corpo_texto` ou `erro`. Limitar também a espera da chamada, sem prometer que autenticação/rede caberão exatamente em 20 segundos; ele assina e transmite. Auditar o uso do certificado sem material secreto.
- Tratar 201 autorizado, 400 rejeitado, 403 certificado, 500/timeout/conexão após envio em verificação, conforme o brief e o contrato, com erros por campo e nota_id.
- Só reenviar diretamente quando houver evidência contratual de que não houve envio; falha ambígua vai para verificação para evitar duplicação. Uma conexão interrompida com o transmissor não prova que ele não enviou ao governo.
- Persistir transição e intenção de webhook de forma atômica ou recuperável, com deduplicação; `nota.autorizada`/`nota.rejeitada` recebem o objeto completo da nota e respeitam organização, integração, ambiente e empresa.
- Primeira entrega de webhook pela API em segundo plano quando disponível; sem isso, fila persistida para o agendador, sem erro nem perda.

### Parte 4 — Verificação e consultas
- Reutilizar a chamada OIDC existente a cada minuto, preservando o processamento de webhooks; lotes limitados e leases impedem dois ciclos consultarem a mesma nota simultaneamente.
- Consultar DPS após mais de 1 minuto em verificação; chave encontrada → consultar NFS-e → autorizar e emitir evento uma única vez.
- 404: repetir; após 15 minutos sem geração, rejeitar com “O governo não gerou esta nota”. Falhas de conexão não contam como prova de ausência.
- GET lista/detalhe/XML com filtros `empresa_id`, `empresa_id_externo`, `situacao`, `id_externo`, `tomador_documento`, `emitida_de`, `emitida_ate` e paginação por cursor; XML somente autorizado, demais casos 404.
- PDF: sempre 503 com “PDF em preparação”, no envelope/código definido no contrato, sem PDF provisório.
- Consulta pública: procurar fonte oficial confiável; se não confirmada, `links.consulta_publica = null`.

### Parte 5 — Painel, documentação e publicação
- Menu Notas somente leitura: filtros por empresa, situação, período e ambiente atual; detalhe com resumo, tomador, valores, rejeições em português e linha do tempo.
- Detalhes técnicos e download de XML com autorização organizacional; nova aba Tomadores por empresa, lista e detalhe. Developer/viewer somente leem.
- Preservar identidade visual, navegação e domínio oficial. Cada nova página recebe título e descrição próprios.
- Atualizar `openapi.yaml`, `notas.md`, `webhooks.md`, convenções quando necessário, documento do agendador e exemplos de eventos de nota/curl.
- Registrar decisões estruturais no AGENTS.md; publicar somente após implementação aprovada e validações, para o teste real do proprietário.

## Detalhes técnicos e validação
- Código de produção: módulos TypeScript separados para esquemas, montador XML, leitura XML, persistência/transições, cliente do transmissor e verificações; rotas usam o núcleo `apiRoute` existente.
- Produção usa biblioteca XML JavaScript compatível com o ambiente hospedado (proposta: `fast-xml-parser`, com entidades externas recusadas). Não executar ferramentas nativas de validação XSD no servidor.
- Testes XSD: **Python lxml/libxml2**, disponível no ambiente de testes, chamado pelo conjunto de testes local; usar somente os arquivos da pasta 1.01 do ZIP oficial e resolver includes/imports localmente, sem rede. Guardar o teste no projeto.
- Testes concretos: Id/CNPJ=2; limites/séries/números; ambiente; datas; escape; tomador ausente/PF/PJ/estrangeiro; alíquota permitida/proibida; E0713; decimais sem arredondamento binário; XML inválido rejeitado pelo XSD.
- Emissão com transmissor simulado: 201/400/403/500, timeout, falha comprovadamente anterior ao envio, resposta ambígua, corpo diferente com mesma chave, concorrência, repetição em processamento/verificação e mesmo número/DPS após 503.
- Rotina: chave encontrada, consulta XML, 404 antes/depois de 15 minutos, conexão falhando e transição/webhook sem duplicação.
- Banco com reversão: grants/RLS, isolamento entre organizações, unicidade por escopo, número nunca devolvido, exclusão com histórico e proteção concorrente quando houver conexão de teste adequada.
- Não considerar testes simulados como prova de emissão real. Teste real com A1 e primeira nota em produção será feito pelo proprietário; interface autenticada permanecerá “não verificada” se não houver sessão de teste disponível.

## Entregas e critério de conclusão
Cada parte termina com testes correspondentes e documentação atualizada. Ao final: tabelas e rotas, três DPS sem assinatura validadas pelo XSD, painel somente leitura, consultas automáticas, eventos de nota e publicação. Não emitir nota real nem modificar transmissor/ durante os testes; a primeira emissão real em produção é feita pelo proprietário com seu script.

**A aprovação inclui os cinco complementos de contrato acima.** Se algum não for aceito, revisar esse trecho antes da implementação. O estrangeiro é um tipo de tomador, não implica automaticamente serviço de exportação; operações que precisem de grupos fiscais não contemplados em E1 serão recusadas previamente com campo e motivo específicos.

# Emissão de NFS-e — etapa E1

## Estado do plano: preliminar, aguardando os contratos atualizados
Nenhuma implementação, migração ou publicação está autorizada nesta etapa. Nada dentro de `transmissor/` será criado, editado, movido ou apagado.

**Conferência desta cópia do projeto:** `docs/api/notas.md` não está presente; `transmissor/LEIAME.md` ainda contém somente as rotas de certificados e convênio. Não foi possível ler os dois commits informados nem confirmar a sincronização com a main. A integração Git é controlada nas configurações do projeto, sem ferramenta do agente para forçar a atualização.

Os contratos atualizados são necessários para fechar nomes de campos, filtros, estados, códigos de erro e entradas/respostas das três novas rotas. O plano será finalizado após essa leitura, antes de qualquer implementação.

## Divergências já confirmadas
- **Tipo de inscrição no identificador DPS:** o brief informa CNPJ = 1, mas o Anexo I v1.01, aba `LEIAUTE DPS_NFS-e`, linha identificada como 101, define **CPF = 1 e CNPJ = 2**. Proposta: usar **2 para CNPJ**, conforme a referência oficial. O XSD exige `DPS` + 42 dígitos, total de 45 caracteres.
- **Idempotência de emissão:** as convenções atuais devolvem `409` durante uma requisição em andamento e não guardam respostas `5xx`. E1 exige recuperar a nota já criada e reenviar a mesma DPS após falha comprovadamente anterior ao envio. Proposta: tratamento específico para emissão, mantendo o comportamento das outras rotas. A resposta exata durante processamento/verificação será alinhada a `notas.md`.
- **DPS sem assinatura:** o XSD v1.01 permite ausência de `Signature` (`minOccurs=0`), portanto é possível validar os três exemplos sem assinatura contra o esquema original, sem modificá-lo.

## Divisão proposta e ordem

### Parte 1 — Contratos, persistência e tomadores
- Ler os dois contratos atualizados e fechar uma matriz pedido → campos da DPS → resposta da nota → resultados do transmissor.
- Criar `invoices`, `invoice_events` e `company_customers`, sem notas de demonstração. Notas guardam snapshots de tomador, empresa/configuração necessária e serviço para não mudar com edições posteriores.
- Guardar estados públicos separados dos controles internos de envio, tentativas e verificações; definir estados reservados de cancelamento apenas conforme o contrato.
- Notas: `external_id` único por organização; tomadores: `external_id` único por empresa. Vínculos compostos garantem empresa e integração da mesma organização.
- RLS organizacional, concessões explícitas em cada tabela; escrita de notas e eventos somente pelo servidor. Tomadores: API autorizada e painel somente leitura nesta etapa.
- Reutilizar a reserva definitiva existente, com exclusão de empresa passando a conferir também a existência de notas em ambos os ambientes.
- Implementar GET/POST/PATCH de tomadores, com validações nacionais/exterior e isolamento por empresa, após confirmar o objeto do contrato.

### Parte 2 — Montagem e leitura XML
- Montador próprio e puro da DPS v1.01, sem assinatura, com ordem dos elementos do XSD, namespace, versão, UTF-8 e escape de caracteres.
- Identificador de 45 caracteres, série com 5 dígitos e número com 15 no identificador; preservar números grandes como texto, sem perda de precisão.
- Ambiente somente pela chave; `dhEmi` com `-03:00`; prestador, tomador opcional/PF/PJ/estrangeiro, serviço/local, descontos e tributos conforme referência.
- Aplicar E0621/E0625 e E0713 antes da reserva sempre que validáveis: alíquota do ISS somente quando permitida; não optante exige percentuais por esfera e não contém `indTotTrib`/`pTotTribSN`.
- Sem IBS/CBS nem intermediário. Conferir no contrato o comportamento de pedidos que exijam esses grupos, sem omitir informações obrigatórias silenciosamente.
- Salvar três exemplos sem assinatura em `docs/exemplos/dps/`, com dados fictícios identificados: ME/EPP sem retenção com PJ, não optante com PF, estrangeiro.
- Leitura segura do XML autorizado por namespace, sem DTD/entidades externas: número, chave, datas e valores governamentais, mantendo o XML recebido.

### Parte 3 — Emissão segura e idempotência
- `POST /api/v1/notas` exige Idempotency-Key; validar pedido e prontidão pelo cálculo compartilhado antes de numerar.
- Persistir a associação entre chave, hash e nota, com proteção concorrente e recuperação após interrupção. Não permitir duas emissões para o mesmo pedido nem reservar outro número na repetição.
- Reservar definitivamente, guardar nota e DPS sem assinatura para reenvio idêntico; registrar transições seguras na linha do tempo.
- Chamar o transmissor privado com limite de 18 segundos conforme seu contrato v2; ele assina e transmite. Auditar o uso do certificado sem material secreto.
- Tratar 201 autorizado, 400 rejeitado, 403 certificado, 500/timeout/conexão após envio em verificação, conforme o brief e o contrato.
- Só reenviar diretamente quando houver evidência contratual de que não houve envio; falha ambígua vai para verificação para evitar duplicação. Uma conexão interrompida com o transmissor não prova que ele não enviou ao governo.
- Persistir transição e intenção de webhook de forma atômica ou recuperável, com deduplicação; `nota.autorizada`/`nota.rejeitada` recebem o objeto completo da nota e respeitam organização, integração, ambiente e empresa.
- Primeira entrega de webhook pela API em segundo plano quando disponível; sem isso, fila persistida para o agendador, sem erro nem perda.

### Parte 4 — Verificação e consultas
- Reutilizar a chamada OIDC existente a cada minuto, preservando o processamento de webhooks; lotes limitados e leases impedem dois ciclos consultarem a mesma nota simultaneamente.
- Consultar DPS após mais de 1 minuto em verificação; chave encontrada → consultar NFS-e → autorizar e emitir evento uma única vez.
- 404: repetir; após 15 minutos sem geração, rejeitar com “O governo não gerou esta nota”. Falhas de conexão não contam como prova de ausência.
- GET lista/detalhe/XML conforme filtros e paginação do contrato; XML somente autorizado, demais casos 404.
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

## Próximo passo necessário
Disponibilizar nesta cópia `docs/api/notas.md` e `transmissor/LEIAME.md` v2, pela sincronização Git ou anexando os dois arquivos. Depois, revisar apenas os pontos dependentes desses contratos e apresentar o plano final para aprovação. Nenhuma parte será implementada a partir deste plano preliminar.

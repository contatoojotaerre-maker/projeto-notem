# Fase 5 — Cancelamento, análise fiscal e substituição de NFS-e

Sem alterações em `transmissor/`. Execução em 4 partes, com pausa após a Parte 1 para você conferir os XML de evento (mesmo procedimento da DPS).

## O que encontrei nas referências oficiais (pontos de atenção)
1. **Id do pedido**: o XSD exige `PRE` + 56 dígitos (59 caracteres) = chave (50) + código do evento (6). A documentação do tipo cita também um "número do pedido", mas o padrão não tem espaço para ele; seguirei o padrão (igual ao briefing).
2. **Motivo da análise fiscal**: o comentário do XSD diz "3 - Outros", mas os valores aceitos são 1, 2 e **9**. Usarei 9 (igual ao briefing).
3. **Motivo da substituição**: o XSD aceita `01, 02, 03, 04, 05, 99` (dois dígitos); o Anexo I mostra um dígito. Usarei os do XSD. `xMotivo` é opcional no governo (obrigatório só com 99, E0078); a notem exigirá sempre 15–255, como pede o briefing.
4. **Ordem no XML**: o grupo `subst` fica logo após `cLocEmi` e antes de `prest`.
5. **Matriz de eventos (RN EVENTOSxEVENTOS)**: com análise pendente não é possível cancelar, substituir nem pedir nova análise (também E0068); após confirmação do prestador/tomador/intermediário o cancelamento é recusado (E0840) e a substituição também (E0070); após confirmação tácita, idem (E0072). Aplicarei esses bloqueios quando a manifestação for conhecida (hoje ela só chegará com a sincronização ADN).
6. **Outras regras de substituição que dá para checar antes de numerar**: E0042 (mesma empresa, mesmo CNPJ e município emissor da original), E0046 (original cancelada), E0065 (mesmo ambiente). E0050, E0056, E0058 e E0074 dependem da parametrização do município: só terão tradução quando o governo recusar.
7. **Autor do evento (E0812)**: antes de enviar, confiro se a base do CNPJ do certificado ativo corresponde ao CNPJ da nota; se não, recuso sem enviar.

## Parte 1 — Montador dos eventos (pausa para conferência)
- Montador próprio de `pedRegEvento` v1.01 para e101101 e e101103: `tpAmb` da nota, `verAplic`, `dhEvento` em -03:00, `CNPJAutor` = prestador, `chNFSe`, `xDesc` exato, `cMotivo`, `xMotivo` 15–255 (sem DTD/entidades, texto escapado).
- Grupo `subst` no montador da DPS (`chSubstda`, `cMotivo`, `xMotivo`).
- Testes validando contra o XSD oficial (mesmo padrão da DPS, ZIP intacto).
- Exemplos sem assinatura em `docs/exemplos/eventos/`: cancelamento, análise fiscal e uma DPS substituta. Envio os XML completos no chat e aguardo sua conferência antes da Parte 2.

## Parte 2 — Banco e fluxo fiscal
- Nova tabela de **pedidos de evento** por nota: tipo, motivo, justificativa, chave de idempotência, origem (API/painel), quem pediu, XML sem assinatura/assinado, resposta do governo, XML oficial do evento, erros, estado e controle de concorrência. Leitura pelos membros da organização; escrita só pelo servidor após validar o papel.
- Um único pedido ativo por nota: enquanto houver cancelamento em envio/verificação, análise pendente ou substituta em andamento, novos pedidos recebem 409.
- **Cancelamento**: 201 com `eventoXml` → nota `cancelada`, XML guardado, linha do tempo e webhook `nota.cancelada`, tudo na mesma transação. Rejeição → 422 com detalhes e tradução; E0822/E0823/E0824/E0827 marcam `pode_solicitar_analise`.
- **Tempo esgotado/conexão após o envio** → `operacao_pendente` em verificação; o agendador consulta `/v1/nfse/evento/consultar` (101101, sequência 1). Encontrado → cancelada. Não encontrado por 15 minutos (mesma regra da DPS) → pedido concluído como "não registrado", campo volta a null e a nota segue autorizada. Nunca reenvia sem consultar.
- **Cancelamento já registrado fora da notem**: se a recusa indicar evento de cancelamento existente (E0840 ou equivalente), consultar 101101/sequência 1; encontrado → guardar XML oficial, nota `cancelada`, linha do tempo "Cancelamento registrado fora da notem" e `nota.cancelada`; não encontrado → recusa normal.
- **Análise fiscal**: mesmo fluxo; sucesso → `cancelamento_em_analise` e webhook `nota.cancelamento_em_analise`.
- **Substituição**: mesmo fluxo da emissão (validações antes de numerar, numeração definitiva, verificação, E0014). A nova nota nasce com `substitui_nota_id`; somente quando ela é autorizada a original vira `substituida` com `substituida_por_nota_id`, na mesma transação, com `nota.autorizada` (nova) e `nota.substituida` (original). Rejeitada a nova, a original não muda.
- Webhooks sem duplicação (um aviso por nota e tipo de mudança).
- Permissões no banco e no servidor: owner, admin, operator e administrador da plataforma; developer e viewer só visualizam.

## Parte 3 — API e documentação
- `POST /notas/{id}/cancelar` e `POST /notas/{id}/solicitar-analise-cancelamento`: corpo `motivo` + `justificativa`, `Idempotency-Key` obrigatória e duradoura (como em `POST /notas`). Respostas 200 / 202 / 409 / 422.
- `POST /notas/{id}/substituir`: campos de `POST /notas` (os não enviados vêm da nota original) + `motivo` (`desenquadramento_simples`, `enquadramento_simples`, `inclusao_imunidade_isencao`, `exclusao_imunidade_isencao`, `rejeicao_tomador_intermediario`, `outros`) + `justificativa`. Empresa diferente da original → 422.
  - **E0061** (MEI e ME/EPP): não muda o documento do tomador (se identificado na original), a competência nem o valor do serviço.
  - **E0060** (não optante): não muda competência, código do serviço, código municipal nem local da prestação.
  - A regra aplicada segue a opção do Simples da DPS substituta (a que o governo valida).
- **Complementos aprovados**: `GET /notas/{id}/eventos/{codigo}/xml` (ex.: 101101) baixa o XML oficial do evento registrado; objeto `cancelamento` na nota (`motivo`, `justificativa`, `solicitado_em`, `registrado_em`, `situacao`, `pode_solicitar_analise`).
- Campo `operacao_pendente` na nota (API, webhooks e painel), null quando não houver.
- Documentação: novo `docs/api/cancelamento.md`, atualização de `notas.md` (remove "não disponível nesta versão"), `webhooks.md` (exemplos completos dos novos avisos) e `openapi.yaml` validado no teste OpenAPI 3.1.

## Parte 4 — Painel e testes
- Detalhe da nota: botões **Cancelar** e **Substituir** (somente autorizada e para quem tem permissão) e **Solicitar análise da prefeitura** (após recusa por E0822/E0823/E0824/E0827). Diálogos com motivo, justificativa com contador (15–255) e confirmação explícita "Esta ação tem efeito fiscal".
- Aviso "Cancelamento aguardando confirmação do governo" quando houver `operacao_pendente`.
- **Substituir**: hoje o painel não tem formulário de emissão; criarei um formulário de substituição pré-preenchido com a nota original (serviço, competência, descrição, tomador, valores, retenção, local), bloqueando os campos proibidos por E0060/E0061 conforme a configuração fiscal atual.
- Linha do tempo com cada evento e download do XML do evento em "Detalhes técnicos". O DANFSe já mostra CANCELADA/SUBSTITUÍDA.
- Testes: montador (Id, motivos, limites de texto, XSD); cancelamento com transmissor simulado — 201, E0822/E0823/E0824/E0827 com `pode_solicitar_analise`, E0840, tempo esgotado com consulta encontrada/não encontrada, idempotência; análise fiscal; substituição — E0060/E0061, `subst` no XSD, original só substituída após autorização, webhooks sem duplicação; permissões por papel; isolamento entre organizações e ambientes; teste de banco com rollback.
- Publicação ao final.

## Limites que ficarão registrados
- Produção já tem uma nota real autorizada (Group Jota, NFS-e nº 11, série 900, DPS 1), considerada nos testes publicados; cancelar ou substituir essa nota tem efeito fiscal real e só será feito com sua autorização explícita.
- Deferimento/indeferimento da análise e manifestações (confirmações) só serão conhecidos com a sincronização ADN (fase 7).

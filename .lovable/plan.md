# Fase 7 — Sincronização com o ADN (notas e eventos de todos os sistemas)

Nada em `transmissor/` será tocado. Uso apenas as rotas v4 `POST /v1/adn/dfe` e `POST /v1/adn/eventos`. Hoje há uma empresa apta (Group Jota, CNPJ 63.642.453/0001-31, certificado válido, só notas de produção), então a homologação não será sincronizada para ela.

## Divisão e pausas
1. **Parte 1 — Núcleo**: banco, leitura dos XML, sincronização por NSU, aplicação dos eventos, reconciliação pela chave e testes. Depois publico e acompanho a primeira sincronização da Group Jota lendo o banco. Esperado: nota nº 11 = cancelada, com "Registrado fora da notem". **Pausa para seu relatório.**
2. **Parte 2 — API e documentação**: campo `origem`, filtro, notas recebidas, sincronização, `sincronizacao.md`, OpenAPI validado.
3. **Parte 3 — Painel**: selo e filtro em Notas, abas Sincronização e Notas recebidas, botão "Atualizar com o governo", testes finais e publicação.

## Parte 1 — Núcleo

### Onde ficam os dados
As empresas são cadastradas por organização: o mesmo CNPJ pode existir em várias. Por isso, o que vem do governo fica guardado **por CNPJ e ambiente**, não por organização.
- **Cursor** (CNPJ + ambiente): último NSU, última consulta, próxima consulta permitida, situação, último erro, falhas seguidas, documentos importados e reserva de execução, para nunca rodar duas vezes ao mesmo tempo.
- **Distribuição**: uma linha por NSU recebido (NSU, tipo, tipo de evento, chave, data de geração). Repetir um NSU não muda nada.
- **Documento NFS-e oficial**: uma linha por chave e ambiente, com o XML original e os dados lidos: número, DPS, datas, prestador, tomador, intermediário, serviço, valores, situação, restrições e manifestação. Uma nota que chegue pelo CNPJ do prestador e pelo do tomador é guardada uma única vez.
- **Evento oficial**: uma linha por chave + código + sequência, com XML, data de processamento, se foi aplicado e se foi pedido pela notem.

### Sincronização (no ciclo de 1 minuto do Cloud Scheduler)
- **Aptos**: CNPJs com ao menos uma empresa ativa e certificado válido. Produção sempre; homologação só se houver nota de homologação na notem.
- **Por ciclo**: até 3 CNPJs e até 4 lotes por CNPJ, dentro de um limite de tempo.
- **`DOCUMENTOS_LOCALIZADOS`**: grava e processa o lote numa só operação e continua do maior NSU + 1 no mesmo ciclo ou no seguinte.
- **`NENHUM_DOCUMENTO_LOCALIZADO`**: próxima consulta só após 1 hora.
- **`REJEICAO`, erro HTTP ou de conexão**: registra e espera de forma crescente (5 min, 15 min, 1 h, 3 h, 6 h no máximo). Se a mensagem for de consumo indevido, vale a espera indicada pelo governo, nunca menos de 1 hora.
- **Primeira vez**: começa do NSU 0, ou seja, todo o histórico do CNPJ.

### Processamento das NFS-e
- **Chave já emitida pela notem**: completa o XML oficial se faltar, sem duplicar. Uma DPS da notem ainda "em verificação" também é reconhecida pelo identificador da DPS e não é importada como externa; a verificação atual conclui normalmente.
- **Prestador é a empresa e a nota não é da notem**: vira nota de origem "externa".
- **Empresa é tomadora ou intermediária**: entra em "Notas recebidas".
- **Leitura dos XML**: o leitor recusa DTD e entidades e lê o XML de forma tolerante (o que não for reconhecido fica guardado, sem quebrar o lote).

### Eventos (códigos oficiais do esquema v1.01)
| Evento | Efeito |
|---|---|
| 101101 Cancelamento, 105104 Deferido | `cancelada` |
| 105102 Cancelamento por substituição | `substituida`, ligando à substituta quando conhecida |
| 101103 Solicitação de análise fiscal | `cancelamento_em_analise` |
| 105105 Indeferido | volta a `autorizada`, registrando o indeferimento |
| 305101 Cancelamento por ofício | `cancelada_prefeitura` |
| 305102 / 305103 Bloqueio / desbloqueio | atualiza `restricoes` |
| 202201, 203202, 204203, 205204, 202205, 203206, 204207, 205208 | atualiza `manifestacao` |
| INCLUSAO_NFSE_DAN, TRIBUTOS_NFSE_RECOLHIDOS | só linha do tempo; não existem no esquema v1.01, ficam guardados como vieram |

- **Ordem**: eventos aplicados pela data de processamento, sem retrocesso. Uma nota cancelada, substituída ou cancelada pela prefeitura não volta a autorizada; o indeferimento só desfaz a situação "em análise".
- **Evento antes da nota**: fica guardado e é aplicado quando a nota chegar, pela notem ou pelo ADN.
- **Pedido da própria notem aguardando confirmação**: o evento confirma esse pedido. Caso contrário, a linha do tempo mostra "Registrado fora da notem".
- **Avisos (webhooks)**: só para notas emitidas pela notem, cada um no máximo uma vez por nota, evento e sequência: `nota.cancelada`, `nota.substituida`, `nota.cancelamento_em_analise`, `nota.cancelamento_indeferido`, `nota.cancelada_prefeitura`, `nota.bloqueada_prefeitura`, `nota.manifestacao`. Notas externas e recebidas não geram aviso.

### Reconciliação pela chave
- Recusa por evento existente (E0840 ou equivalente): além da consulta atual ao 101101, consulta todos os eventos da chave e aplica.
- "Atualizar com o governo" (o botão entra na Parte 3): no máximo 1 vez a cada 5 minutos por nota, conferido no servidor.

## Parte 2 — API (docs/api atualizados, OpenAPI 3.1 validado)
- **Campo `origem` na nota** (`notem` | `externa`) e filtro `origem` em `GET /notas`. A lista junta as duas origens, ordenada pela data de emissão.
- **Notas externas na API**: `GET /notas/{id}`, `/xml`, `/pdf` e XML dos eventos funcionam. Cancelar e substituir respondem `409 CONFLITO`: "Nota emitida fora da notem. Cancele ou substitua pelo sistema que a emitiu ou pelo Portal Nacional."
- **Notas recebidas**: `GET /empresas/{id}/notas-recebidas` (paginada; filtros período, situação e prestador), `/notas-recebidas/{id}`, `/xml` e `/pdf`.
- **Sincronização**: `GET /empresas/{id}/sincronizacao` retorna último NSU, última e próxima consulta, situação e último erro.
- **Documentação pública** `docs/api/sincronizacao.md`: o que é importado, frequência e limites, sem detalhes internos. Também atualizo `notas.md`, `LEIAME.md` e os exemplos de webhooks.

## Parte 3 — Painel
- **Notas**: selo "Emitida fora da notem" e filtro por origem. O detalhe da nota externa é só leitura (sem cancelar ou substituir) e tem XML e PDF.
- **Empresa → Sincronização**: por ambiente, mostra situação, último NSU, última e próxima consulta, documentos importados e último erro. O botão "Sincronizar agora" respeita o intervalo do ADN e fica desativado com contagem regressiva.
- **Empresa → Notas recebidas**: lista com filtros e detalhe, só leitura, com XML e PDF.
- **Permissões**: leitura como nas demais notas. Sincronizar e "Atualizar com o governo" ficam com proprietário, administrador, operador e administrador da plataforma, conferido no servidor.

## Testes
- **Cursor**: avanço do NSU, espera de 1 h sem documentos, espera crescente em erro, nada rodando duas vezes ao mesmo tempo.
- **Documentos**: cada NSU processado uma só vez; nota da notem sem duplicar, nota externa e nota recebida.
- **Eventos**: cada tipo com a situação correta, sem retrocesso, e evento chegando antes da nota.
- **Visibilidade e avisos**: quem vê o quê entre organizações; avisos só para notas da notem e sem repetição.
- **Reconciliação**: E0840 e o botão; isolamento entre organizações e ambientes.
- **Banco**: testes com desfazimento ao final, sem alterar a nota real.

## Pontos para sua decisão
1. **Prova de posse do CNPJ (recomendo)**: hoje qualquer organização pode cadastrar qualquer CNPJ sem certificado. Proponho que notas externas e recebidas apareçam só para organizações cuja empresa daquele CNPJ já teve certificado válido cadastrado (atual ou anterior). Sem isso, quem cadastrar o CNPJ de outra pessoa veria as notas dela.
2. **Certificado usado**: quando mais de uma organização tiver certificado válido do mesmo CNPJ, a sincronização usa o de validade mais longa. Consulta por CNPJ raiz (matriz consultando filiais) fica fora desta fase.
3. **Ambiente na API**: `GET /empresas/{id}/sincronizacao` mostraria só o ambiente da chave usada, como em toda a API. O painel mostra os dois.
4. **Desbloqueio por ofício**: atualiza `restricoes` sem aviso, porque a lista de avisos não tem desbloqueio. Se preferir, crio `nota.desbloqueada_prefeitura`.
5. **Nota da notem recebida por outra organização**: se a tomadora for empresa de outra organização da notem, ela vê a nota em "Notas recebidas", com os dados que o ADN entrega ao próprio tomador.

## Detalhes técnicos
- **Tabelas novas** (cursor, distribuição, documentos, eventos e intervalo do botão), com grants explícitos e RLS. A leitura usa uma função de visibilidade por CNPJ da organização; a gravação é só pelo serviço.
- **Funções do banco**: reserva de cursores com bloqueio que pula linhas ocupadas, para não haver execução concorrente. A gravação de cada lote é atômica e já aplica eventos, linha do tempo e avisos. Os avisos usam identificador determinístico para não duplicar.
- **Código**: novo módulo `adn-sync.server.ts`; a leitura de NFS-e e eventos reutiliza o leitor de XML seguro atual. `transmissor.server.ts` ganha as duas rotas ADN. O processamento da Cloud Scheduler chama a sincronização.
- **Regras técnicas**: registradas em `src/lib/AGENTS.md`.

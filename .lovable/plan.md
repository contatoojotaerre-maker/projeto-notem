# Fase C — Parte 1: leiaute NT 009 (release 1)

Escopo desta etapa: somente a Parte 1. Nada é enviado ao governo (nem homologação); `transmissor/` não é tocado; a API pública não muda. Pausa com relatório ao final.

## Bloqueio antes de começar

A pasta `docs/referencias/rtc/` **não está no projeto** (só existem `anexos/`, `dados/`, `esquemas/` com o ZIP de 09/02/2026, `manuais/` e `swaggers/`). Sem o XSD do release 1, a NT 009 e a NT 008 não consigo validar as DPS nem conferir a ordem exata dos campos. Preciso que os arquivos cheguem ao projeto (sincronização GitHub ou envio pelo chat) antes de aplicar. Ao recebê-los, confiro as cinco diferenças descritas no briefing contra o XSD e aviso se alguma não bater.

## O que muda para o usuário

1. **Administração → nova seção "Leiaute fiscal"** (somente administrador da plataforma):
   - Mostra o leiaute vigente agora em cada ambiente: Homologação = "NT 009 (release 1)"; Produção = "Leiaute atual" ou "NT 009 (release 1)" conforme a data.
   - Campo "Início do leiaute NT 009 em produção" (padrão 01/12/2026 00:00, horário de Brasília), com confirmação antes de salvar e registro na trilha de auditoria (quem, quando, valor anterior e novo).
2. **DANFSe**:
   - "Finalidade" passa a mostrar a descrição: 0 = "NFS-e regular", 1 = "NFS-e de crédito", 2 = "NFS-e de débito" (hoje mostra "código 0").
   - Destinatário: com indicação de que o destinatário é o próprio tomador, imprime "O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO"; "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" só quando não houver indicação (nota sem grupo IBS/CBS).
   - CST/cClassTrib e valores de ajuste da base lidos nos dois formatos.

## Como o leiaute é escolhido

- Homologação: sempre NT 009 release 1.
- Produção: NT 009 release 1 a partir da data configurada; antes dela, leiaute atual.
- **Momento da decisão** (ponto para sua confirmação): a decisão é tomada **imediatamente antes de cada envio** (quando a DPS segue para assinatura no transmissor), não só no pedido. Motivo: um pedido criado às 23:59 de 30/11 e enviado às 00:00 de 01/12 iria no leiaute errado. A validação antes da numeração usa o leiaute que vale no momento do pedido.
- **Remontagem com o mesmo número**: se o leiaute de envio for diferente do da DPS guardada, a DPS é remontada a partir dos dados já gravados no pedido, com o mesmo número, série e data de emissão, **apenas** nos caminhos que já permitem envio hoje (primeiro envio, "envio não realizado" com a mesma Idempotency-Key, avanço E0014). Casos ambíguos continuam só com consulta, nunca reenvio. A DPS remontada é guardada como novo arquivo; o arquivo anterior fica preservado para auditoria e a nota registra qual leiaute foi usado.
- Substituições usam o mesmo caminho. Eventos (cancelamento/análise) não mudam.

## Diferenças isoladas no montador (um único montador, dois perfis)

| Ponto | Leiaute atual (`nt004`) | NT 009 release 1 (`nt009r1`) |
|---|---|---|
| `infDPS/finNFSe` | não enviado (XSD antigo recusa) | `0`, após `cMotivoEmisTI` e antes de `chNFSeRej`/`cLocEmi` |
| Ordem em `cServ` | `cTribNac, cTribMun, xDescServ, cNBS` | `cTribNac, cTribMun, cNBS, cIntContrib, xDescServ` |
| `vDedRed` / `vAjusteBC` | não enviado | não enviado |
| Série 900 | válida | válida |

Grupo IBS/CBS continua fora da DPS nesta parte (entra na Parte 3).

## Leitores tolerantes (NFS-e, ADN, DANFSe, eventos)

Um único módulo de leitura aceita os dois formatos:
- `CST`/`cClassTrib` em `IBSCBS/valores/trib/` ou em `.../trib/gIBSCBS/`;
- `finNFSe` em `infDPS` ou em `IBSCBS`;
- `dest`/`indDest` na raiz de `infDPS` ou dentro de `IBSCBS`;
- `vAjusteBC` ou `vDedRed`; `vCalcAjusteBCISSQN` ou `vCalcDR`; `vCalcAjusteBCIBSCBS` ou `vCalcReeRepRes`.

## Testes automáticos

- Cada cenário existente (Simples PJ, não optante PF, estrangeiro, substituição, com e sem NBS, com desconto) gerado nos dois perfis e validado no XSD correspondente; o teste também exige que a DPS de um perfil **falhe** no XSD do outro (detecta perfil trocado).
- Troca pela data: antes/depois do horário, homologação × produção, e data adiada.
- Remontagem: DPS guardada no leiaute antigo enviada após a troca sai no novo com o mesmo número; caso ambíguo não remonta nem reenvia.
- Permissão: só administrador da plataforma altera a data (owner/admin de organização e demais papéis recusados no servidor); alteração gera registro de auditoria.
- DANFSe: finalidade com descrição; textos do destinatário; CST/cClassTrib nos dois caminhos.

## Documentação

- `docs/exemplos/dps/`: exemplos no leiaute NT 009 (os atuais passam para uma subpasta do leiaute antigo).
- `docs/interno/`: perfis de leiaute, regra de escolha, remontagem e mapeamento NT 008 × NT 009.
- Cópias dos XSD do release 1 em `docs/referencias/esquemas/nt009-r1/` com os nomes que os `include` esperam; o XSD de 09/02/2026 fica intacto para o leiaute antigo.

## Detalhes técnicos

- Banco: tabela `platform_settings` (linha única) com `nt009r1_production_starts_at timestamptz` (padrão `2026-12-01T03:00:00Z`); acesso só pelo servidor (revogar anon/authenticated, conceder ao service_role); colunas futuras da Parte 3 entram depois. `invoices.dps_layout` (texto, `nt004`/`nt009r1`) gravado no RPC que reserva/atualiza a base. Alteração da data por server function autenticada que confere administrador da plataforma antes de usar o cliente privilegiado e grava em `admin_audit_events`.
- Montador: `buildDps(input, layout)` com as diferenças concentradas numa tabela de perfil; `chooseLayout(environment, now, settings)` puro e testado.
- Envio: `sendInvoice` resolve o leiaute antes de ler a base; se diferente, remonta a partir de `dps_input`, grava o arquivo e troca a referência por RPC atômico sob o mesmo lease, depois aplica Id/nDPS como hoje.
- Validador Python: parâmetro de leiaute (`--layout=nt004|nt009r1`); a correção em memória do padrão da série continua só no XSD antigo; no release 1 só será aplicada se o mesmo defeito existir (aviso antes).
- Regras novas registradas em `src/lib/AGENTS.md`.

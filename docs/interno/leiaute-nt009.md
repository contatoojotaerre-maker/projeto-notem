# Leiaute NT 009 (release 1) — implementação

## Perfis
`src/lib/dps-layout.ts` concentra as diferenças; `buildDps(input, layout)` recebe o leiaute sempre de forma explícita.

| Ponto | `nt004` (XSD 09/02/2026) | `nt009r1` (NT 009 release 1) |
|---|---|---|
| `infDPS/finNFSe` | não existe (XSD recusa) | obrigatório, `0`, após `cMotivoEmisTI` e antes de `chNFSeRej`/`cLocEmi` |
| `cServ` | `cTribNac, cTribMun, xDescServ, cNBS, cIntContrib` | `cTribNac, cTribMun, cNBS, cIntContrib, xDescServ` |
| `vDedRed`/`vAjusteBC` | não enviado | não enviado |
| Série | padrão com defeito `^...$` (correção só em memória) | `[0-9]{1,4}\|[0-8][0-9]{4}` (oficial, sem correção) |

Os esquemas do release 1 ficam em `docs/referencias/rtc/` com os nomes que os `include` esperam; o validador lê essa pasta diretamente (não há cópia em `esquemas/`). O ZIP de 09/02/2026 continua intacto para o leiaute anterior.

## Escolha do leiaute
- Homologação: sempre `nt009r1`.
- Produção: `nt009r1` a partir de `platform_settings.nt009r1_production_starts_at` (padrão `2026-12-01T03:00:00Z`). Só o servidor lê a tabela.
- Alteração: Administração → Leiaute fiscal, somente administrador da plataforma (verificado na sessão e de novo em `set_nt009_production_start`), com confirmação e linha em `admin_audit_events` (`leiaute.vigencia_producao_alterada`, valores anterior e novo).
- O pedido valida e grava a base no leiaute vigente naquele momento; o leiaute é decidido **de novo imediatamente antes de cada envio** (`dpsForSending`).

## Remontagem com o mesmo número
Só ocorre dentro de `sendInvoice`, depois de `claim_invoice_dispatch` (estado `not_sent`: primeiro envio, envio não realizado ou avanço E0014). Se a base estiver em outro leiaute, é convertida por `convertDpsLayout` (testado como idêntico a montar no leiaute de destino), gravada como novo arquivo e trocada por `replace_invoice_dps_base`, que exige o lease atual, guarda a base anterior como `unsigned_dps_<leiaute>` e registra `dps_layout_changed` no histórico. Qualquer falha antes do envio é "envio não realizado". Casos ambíguos continuam só com consulta.

## Leitura tolerante
`src/lib/nfse-layout-read.ts`: `finNFSe` em `infDPS` ou `IBSCBS`; `CST`/`cClassTrib` em `IBSCBS/valores/trib` ou em `.../gIBSCBS`; `dest`/`indDest` na raiz de `infDPS` ou em `IBSCBS`; `vAjusteBC`/`vDedRed`; `vCalcAjusteBCISSQN`/`vCalcDR`; `vCalcAjusteBCIBSCBS`/`vCalcReeRepRes`. As tabelas da NT 008 v1.02 citam caminhos anteriores à NT 009 e são mapeadas para os dois formatos.

## DANFSe (NT 008 v1.02)
- Finalidade: descrição (0 NFS-e regular, 1 NFS-e de crédito, 2 NFS-e de débito — Anexo VI v1.04.01; o XSD do release 1 aceita só 0).
- Destinatário: bloco próprio quando houver `dest`; "O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO" quando `indDest = 0`; "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" só sem indicação.

## Outras mudanças do release 1 (para as próximas partes)
CNPJ alfanumérico em `TSCNPJ`, chave de acesso e Ids de DPS/eventos (Parte 2, ver `cnpj-alfanumerico.md`; o perfil `nt004` recusa CNPJ com letras e a conversão para ele também); `cIndOp` opcional; `bensMoveis`, locação de imóveis e campos de ajuste; textos `TSDesc*`/`TSDescInfCompl` passam a exigir ao menos um caractere não branco (a notem já normaliza e recusa texto vazio).

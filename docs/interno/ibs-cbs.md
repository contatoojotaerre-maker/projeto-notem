# IBS/CBS na NFS-e — implementação

## Princípio
A notem envia **somente a classificação** (CST, cClassTrib, cIndOp, indFinal e, no próximo leiaute, regApIBSCBSSN/cAtvSN/indDest). Alíquotas, base e valores são calculados pela calculadora do governo e lidos da NFS-e autorizada (`ibsCbsValuesOf` em `src/lib/nfse-layout-read.ts`), nunca calculados pela notem.

## Catálogos (fontes em `docs/referencias/rtc/`)
| Tabela | Origem | Quantidade |
|---|---|---|
| `ibscbs_classifications` | `classificacao_tributaria.csv`, somente NFS-e = Sim | 73 (43 exigem tributação) |
| `ibscbs_operation_indicators` | Anexo VII v1.03 | 28 ativos + 5 retirados (`030103`, `030104`, `050103`, `050104`, `080101`) |
| `ibscbs_service_correlations` | Anexo VIII | 209 itens |

Carga: `scripts/gerar-carga-ibscbs.py` (idempotente). Leitura autenticada por RLS; escrita só pelo serviço.

## Regras do cadastro (uma fonte, dois lugares)
`ibsCbsServiceRuleError` (`src/lib/ibscbs.ts`) e `public.ibscbs_service_rule_error` (gatilho `guard_ibscbs_service_profile`) têm as **mesmas mensagens**:
- atividade 10 ⇔ 16.01; 11 ⇔ 99.04.01; 12/13 ⇔ 7.02 e 7.05;
- não suportados: subitens 99.03/99.04/99.05 e 25.05/15.09/17.12/10.05 (tpOper); classificações com tributação regular (ex.: 550016, 550022), crédito presumido ou diferimento (ex.: 515001); CST 800/811; doações 410003/410026. 820xxx permitido;
- E0860 indicador obrigatório se exige tributação; E0859 proibido se não exige;
- indicador retirado não pode ser escolhido; o já gravado fica "a revisar".

## Obrigatoriedade e leiaute
- Data por ambiente em `platform_settings.ibscbs_required_{sandbox,production}_from` (padrão 2027-01-01; o Anexo VI cita 01/10/2026 para E0855 — divergência conhecida, decisão do proprietário). Comparação pela **competência** da nota (`ibsCbsRequired`); a prontidão usa a data de hoje (aviso antes, item bloqueante depois).
- `nt009r2` (Anexo VI v1.04.01: `regApIBSCBSSN` em `regTrib`, `cAtvSN` após `cNBS`, `indDest` na raiz) fica desligado até `nt009r2_{sandbox,production}_starts_at`. Sem XSD oficial; nunca há conversão de/para `nt009r2` (envio fica "não enviado").
- Conversão de base `nt009r1` com grupo IBS/CBS para `nt004` é recusada.
- Alteração das datas: Administração → Leiaute fiscal, só administrador da plataforma, via `set_fiscal_platform_setting` (service role), auditado como `fiscal.configuracao_plataforma_alterada`.

## Regime de apuração (ME/EPP)
ISS dentro do Simples → padrão 1, opção 3; ISS fora do Simples → padrão 2, opção 3; tudo fora → 3. O gatilho reaplica o padrão quando muda o regime do ISS; o painel avisa. Só vai à DPS no `nt009r2`.

## DANFSe (NT 008)
Bloco sempre presente, com "-" sem o grupo. Exclusões = vDescIncond + vCalcReeRepRes/vCalcAjusteBCIBSCBS + vISSQN + vPis + vCofins; Total IBS/CBS = vIBSTot + vCBS; líquido + IBS/CBS = vTotNF. Somas decimais exatas (`addDecimals`).

## Testes
- `src/test/ibs-cbs.test.ts`: regras, DPS contra XSD release 1, perfil r2, API, rejeições, leitura/DANFSe, sugestão.
- `src/test/ibs-cbs.database.sql`: rollback-only pela ferramenta de migração (catálogos, gatilhos, regime, datas, auditoria, permissões).

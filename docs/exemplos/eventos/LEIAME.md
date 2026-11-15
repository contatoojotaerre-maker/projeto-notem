# Eventos de NFS-e — conferência externa

Três exemplos **sem assinatura**, homologação, dados fictícios; não transmitir ao governo. Gerados por `src/lib/fiscal-events.ts` (eventos) e `src/lib/dps.ts` (DPS substituta).

- `cancelamento.xml`: pedRegEvento v1.01, evento e101101, motivo 1 (erro na emissão).
- `analise-fiscal.xml`: pedRegEvento v1.01, evento e101103, motivo 2 (serviço não prestado).
- `dps-substituta.xml`: DPS v1.01 no leiaute NT 009 (release 1), com `finNFSe` = 0 e grupo `subst` (motivo 99) logo após `cLocEmi` e antes de `prest`.

Chave da nota fictícia: `42122542211222333000181000000000000126111234567890` — mesma estrutura oficial (município, ambiente gerador, tipo de inscrição 2, CNPJ do prestador, número, AAMM, código e DV), DV não calculado pelo governo.

## Decisões a partir dos esquemas oficiais
- `Id` = `PRE` + chave (50) + código do evento (6) = 59 caracteres, conforme o padrão `PRE[0-9]{56}` do XSD.
- Motivo da análise fiscal: o comentário do XSD diz "3 - Outros", mas a lista aceita é 1, 2 e 9; usamos 9.
- Motivo da substituição com dois dígitos (`01`…`05`, `99`), como no XSD.
- `xMotivo` (15–255) segue `TSString`: somente caracteres U+0020–U+00FF, sem quebras de linha nem espaços nas pontas. A notem recusa antes de enviar.
- `CNPJAutor` deve ser o CNPJ do prestador contido na chave (E0812); a DPS substituta deve ter o mesmo município, tipo de inscrição e CNPJ da chave substituída (E0042).

## Validação
Eventos passam no XSD **original** (não usam o tipo de série com defeito):
`python3 src/test/validate-dps-xsd.py --schema=pedRegEvento --official docs/exemplos/eventos/cancelamento.xml docs/exemplos/eventos/analise-fiscal.xml`

DPS substituta, no XSD oficial do release 1 da NT 009 (sem correção em memória):
`python3 src/test/validate-dps-xsd.py --layout=nt009r1 docs/exemplos/eventos/dps-substituta.xml`

Os pedidos de evento não mudaram na NT 009 e passam nos dois esquemas (`--layout=nt004` e `--layout=nt009r1`).

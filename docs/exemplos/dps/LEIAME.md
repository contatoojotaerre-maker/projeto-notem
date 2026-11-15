# Exemplos de DPS

Exemplos **sem assinatura**, ambiente homologação, dados fictícios; não transmitir ao governo. Gerados pelo montador de `src/lib/dps.ts` e conferidos automaticamente com o montador em `src/test/dps-layout.test.ts`. Números ilustrativos (série 1, números 1–5); nenhum número foi reservado no banco.

## Leiaute NT 009 (release 1) — esta pasta

Leiaute usado em homologação desde já e em produção a partir da data configurada na Administração (padrão 01/12/2026 00:00, horário de Brasília).

- `simples-pj.xml`: ME/EPP sem retenção, tomador PJ e desconto incondicionado de 10,00.
- `nao-optante-pf.xml`: não optante, percentuais por esfera, tomador PF.
- `estrangeiro.xml`: tomador estrangeiro identificado por NIF; serviço não é automaticamente exportação.
- `com-nbs.xml`: serviço 01.05.01 com código municipal e NBS 1.1103.21.00.

Diferenças em relação ao leiaute anterior: `finNFSe` = 0 (NFS-e regular) logo após `tpEmit` e antes de `cLocEmi`; em `cServ`, `cNBS` passa a vir antes de `xDescServ`. A notem não envia `vDedRed` nem `vAjusteBC`, e o grupo `IBSCBS` ainda não é enviado.

Validação no XSD oficial do release 1 (`docs/referencias/rtc/`, arquivos lidos como estão — o padrão da série foi corrigido pelo governo nesta versão):
`python3 src/test/validate-dps-xsd.py --layout=nt009r1 docs/exemplos/dps/*.xml`

## Leiaute anterior — `leiaute-anterior/`

Mesmos cenários no leiaute do XSD de 09/02/2026, usado em produção até a data de troca. O padrão `TSSerieDPS` desse ZIP contém `^`/`$` literais (defeito oficial); por autorização do proprietário o teste corrige **apenas** esse padrão em memória. O ZIP permanece intacto.

- Validação com a correção isolada: `python3 src/test/validate-dps-xsd.py --layout=nt004 docs/exemplos/dps/leiaute-anterior/*.xml`
- Reprodução estrita (deve falhar pela série): acrescentar `--official`.

Os testes exigem que cada DPS passe no XSD do seu leiaute **e falhe no do outro**, para que um perfil trocado nunca passe despercebido.

## Regras de negócio já conferidas

E0431/E0432: descontos zero omitidos. E0710/E0712/E0713: matriz por situação do Simples. E0202: tomador nacional não pode ter o documento do prestador.

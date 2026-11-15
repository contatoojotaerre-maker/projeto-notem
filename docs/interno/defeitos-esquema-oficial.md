# Defeitos conhecidos nos esquemas oficiais

Os arquivos oficiais ficam intactos em `docs/referencias/`. Correções existem **somente em memória**, no validador de testes (`src/test/validate-dps-xsd.py`), cada uma restrita a um único padrão e com verificação de que o padrão oficial não mudou.

## 1. `TSSerieDPS` — XSD de 09/02/2026 (leiaute anterior)
O padrão `^0{0,4}\d{1,5}$` usa `^`/`$`, que em expressões XSD são caracteres literais, não âncoras. Correção em memória: `0{0,4}\d{1,5}` (padrão no perfil `nt004`; `--official` valida sem correção). Corrigido pelo governo no release 1 da NT 009.

## 2. `TSChaveNFSe` — NT 009 release 1 (confirmado pelo proprietário com validador independente)
- Publicado: `[0-9]{6}([0-9A-Z]{14})[0-9]{30}` — admite letras nas posições 7–20.
- Estrutura real da chave: `cMun(7) ambGer(1) tpInsc(1) inscrição(14) nNFSe(13) AAMM(4) código(9) DV(1)`; o CNPJ ocupa as posições 10–23, como confirmam `TSIdNFSe` (`NFS[0-9]{9}[0-9A-Z]{14}[0-9]{27}`), `TSIdDPS`, `TSIdPedRegEvt` e `TSIdEvento` do mesmo arquivo.
- Efeito: com o CNPJ oficial `12ABC34501DE35`, a chave tem letra na posição 21 e o `TSChaveNFSe` a recusa. O tipo é usado em `chSubstda` e `chNFSeRej` (DPS), `refNFSe`, e `chNFSe`/`chSubstituta` dos eventos. Chaves só com números, ou com letras apenas nas posições 10–20, não são afetadas.
- Decisão aprovada: a notem valida a chave pela estrutura `9 + 14 + 27` (`src/lib/fiscal-ids.ts`, restrições do banco). Nos testes, a correção em memória é opcional (`--chave-corrigida`, só no perfil `nt009r1`) para `[0-9]{9}([0-9A-Z]{14})[0-9]{27}`; um teste prova que o arquivo oficial recusa a chave e que a correção a aceita.
- Substituição e cancelamento não são bloqueados. Se o governo recusar por falha de esquema (E1235 ou mensagem com "esquema"/"schema") e a chave envolvida for uma das afetadas, a resposta traz: "O governo recusou a chave de acesso com CNPJ alfanumérico por um defeito conhecido no esquema oficial. Tente novamente mais tarde ou use o Portal Nacional." (`explainKeySchemaDefect` em `src/lib/invoices.ts`). Código e mensagem originais são preservados.
- Revisar quando o governo publicar novo release: o validador falha se o padrão oficial mudar, e a correção deve ser removida quando o defeito for corrigido.

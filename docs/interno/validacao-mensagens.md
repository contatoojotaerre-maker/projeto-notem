# Mensagens de validação (zod)

## Regra
- Toda mensagem de validação que chega ao parceiro (API) ou à tela (painel) é em português e controlada pela notem.
- O zod só é importado por `src/lib/validation.ts`. Esse módulo instala o mapa de mensagens da notem (`z.config({ customError })`), que preenche apenas os erros sem mensagem própria. A mensagem escrita num campo (ex.: `'Informe a razão social.'`, `{ message: ... }` de um enum) sempre vence.
- A verificação do código (`no-restricted-imports`) e o teste `validation-rules.test.ts` recusam importar `zod` em outro arquivo.
- Onde o módulo roda: servidor (API `/api/v1`, funções do painel, SSR) e navegador, porque todo esquema importa `z` dele. Não há funções do Supabase no projeto (`supabase/functions` não existe).

## Textos padrão
| Situação | Mensagem |
|---|---|
| Campo ausente | Campo obrigatório. |
| Tipo errado | Informe um texto. / Informe um número. / Informe true ou false. / Informe um objeto JSON. / Informe uma lista. |
| Inteiro | Informe um número inteiro. |
| Campo desconhecido | Campo não aceito: x. / Campos não aceitos: a, b e c. (até 5 nomes, cada um com até 60 caracteres cortados com "…"; acima disso, "e mais N") |
| Opção inválida | Valor inválido. Use: a, b ou c. (vale também para valor único, ex.: "Use: all.") |
| Texto curto/longo | Informe um valor. / Use pelo menos N caracteres. / Use no máximo N caracteres. |
| Número fora do limite | Informe um valor maior/menor (ou igual a / que) N. |
| Lista | Informe pelo menos/no máximo N item/itens. |
| UUID | Identificador inválido (UUID). |
| E-mail | E-mail inválido. |
| Formato | Formato inválido. |
| Data e hora | Data e hora inválidas. |
| Outros | Valor inválido. |

Números saem no formato brasileiro sem depender de `Intl` ("1.024", "9,99"), para o texto ser idêntico em qualquer ambiente.

## Regras mantidas na troca do zod 3 → 4 (4.6.7)
- E-mail: a expressão do zod 3 ficou fixa em `EMAIL_PATTERN`. Comparação com a do zod 4 em 3 milhões de combinações: 0 divergências.
- Data e hora (filtros de logs): `isoDateTime()` reproduz o zod 3, com Z obrigatório, segundos opcionais e frações livres. O zod 4 recusaria hora sem segundos.
- Inteiros: `integer()` reproduz o zod 3. Aceita qualquer inteiro, e as regras do objeto continuam rodando depois de um número com fração. O `.int()` do zod 4 interromperia essas regras e recusaria inteiros acima de 2^53.
- UUID: regra rígida RFC 9562 no corpo, na consulta e no caminho da API (`idParam`): 400 com `campo`. Essa foi a única mudança de resultado, aprovada pelo proprietário e registrada em `docs/api/historico.md`.
- `.strict()`/`.passthrough()` → `z.strictObject`/`z.looseObject`. `.default()` mantém o resultado, porque todos os padrões são valores fixos e válidos.

## Retratos (`docs/interno/zod-v4/`)
1. `retrato-1-zod3-antes.json`: zod 3, antes de qualquer mudança.
2. `retrato-2-zod3-portugues.json`: zod 3 com as mensagens da notem. A diferença 1 → 2 é a tabela abaixo.
3. `retrato-3-zod4.json`: zod 4.6.7. Idêntico ao 2, exceto o UUID fora do padrão (corpo e caminho) e o caso `/notas/{UUID fora do padrão}`, que entrou no passo 3.
4. `retrato-3-zod4-navegador.json`: os mesmos casos de formulário executados num Chromium real, idênticos ao retrato 3.

O retrato vigente fica em `src/test/validation-messages.snapshot.json`, e o teste falha se qualquer mensagem mudar. Para regenerar de propósito, use `UPDATE_VALIDATION_SNAPSHOT=1` e explique cada diferença.

## O que saía em inglês e como ficou (retrato 1 → 2)
| Antes (zod 3) | Agora (notem) |
|---|---|
| Array must contain at most 0 element(s) | Informe no máximo 0 itens. |
| Array must contain at most 18 element(s) | Informe no máximo 18 itens. |
| Expected boolean, received string | Informe true ou false. |
| Expected integer, received float | Informe um número inteiro. |
| Expected object, received array | Informe um objeto JSON. |
| Expected object, received null | Informe um objeto JSON. |
| Expected string, received number | Informe um texto. |
| Invalid | Formato inválido. |
| Invalid enum value. Expected 'nao_optante' \| 'mei' \| 'me_epp', received 'x' | Valor inválido. Use: nao_optante, mei ou me_epp. |
| Invalid enum value. Expected 'nao_retido' \| 'retido_tomador' \| 'retido_intermediario', received 'x' | Valor inválido. Use: nao_retido, retido_tomador ou retido_intermediario. |
| Invalid enum value. Expected 'percent_simples' \| 'percent_by_sphere' \| 'none', received 'x' | Valor inválido. Use: percent_simples, percent_by_sphere ou none. |
| Invalid enum value. Expected 'pj' \| 'pf' \| 'estrangeiro', received 'z' | Valor inválido. Use: pj, pf ou estrangeiro. |
| Invalid enum value. Expected 'sandbox' \| 'production', received 'x' | Valor inválido. Use: sandbox ou production. |
| Invalid enum value. Expected 'webhook.teste' \| 'nota.autorizada' \| 'nota.rejeitada' \| 'nota.cancelada' \| 'nota.cancel... | Valor inválido. Use: webhook.teste, nota.autorizada, nota.rejeitada, nota.cancelada, nota.cancelamento_em_analise, no... |
| Invalid input | Campo obrigatório. / Valor inválido. |
| Invalid literal value, expected "all" | Valor inválido. Use: all. |
| Invalid uuid | Identificador inválido (UUID). |
| Number must be less than or equal to 100 | Informe um valor menor ou igual a 100. |
| Number must be less than or equal to 3 | Informe um valor menor ou igual a 3. |
| Number must be less than or equal to 49999 | Informe um valor menor ou igual a 49.999. |
| Required | Campo obrigatório. |
| String must contain at least 1 character(s) | Informe um valor. |
| String must contain at most 100 character(s) | Use no máximo 100 caracteres. |
| String must contain at most 200 character(s) | Use no máximo 200 caracteres. |
| String must contain at most 2000 character(s) | Use no máximo 2.000 caracteres. |
| String must contain at most 500 character(s) | Use no máximo 500 caracteres. |
| String must contain at most 80 character(s) | Use no máximo 80 caracteres. |
| Unrecognized key(s) in object: 'campo_com_nome_muito_longo_campo_com_nome_muito_longo_campo_com_nome_muito_longo_camp... | Campo não aceito: campo_com_nome_muito_longo_campo_com_nome_muito_longo_campo…. |
| Unrecognized key(s) in object: 'extra' | Campo não aceito: extra. |
| Unrecognized key(s) in object: 'extra_01', 'extra_02', 'extra_03', 'extra_04', 'extra_05', 'extra_06', 'extra_07', 'e... | Campos não aceitos: extra_01, extra_02, extra_03, extra_04, extra_05 e mais 15. |
| Unrecognized key(s) in object: 'k' | Campo não aceito: k. |
| Unrecognized key(s) in object: 'q' | Campo não aceito: q. |
| Unrecognized key(s) in object: 'uf' | Campo não aceito: uf. |
| Unrecognized key(s) in object: 'x' | Campo não aceito: x. |
| Unrecognized key(s) in object: 'y' | Campo não aceito: y. |
| Unrecognized key(s) in object: 'z' | Campo não aceito: z. |
